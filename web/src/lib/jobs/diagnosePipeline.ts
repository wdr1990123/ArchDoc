import { query, queryOne } from "@/lib/db/client";
import { createLlmProvider, type LlmChatOptions, type LlmMessage } from "@/lib/llm/provider";
import {
  buildDiagnosisPrompt,
  buildModuleIntentPrompt,
  buildModuleRolesBatchPrompt,
  enrichReportContent,
  getMissingModuleNames,
  mergeModuleRoles,
  MODULE_BATCH_SIZE,
  reportToMarkdown,
  type ReportIssueInput,
} from "@/lib/llm/prompts";
import { normalizeLlmError } from "@/lib/llm/errors";
import {
  buildModuleContextPack,
  indexAllModuleTypeEvidence,
  indexModuleTypeEvidence,
} from "@/lib/metrics/moduleContextPack";
import {
  getIssuesForScan,
  getMetricsForScan,
  getModulesForScan,
  getScanOverview,
  getSummariesForScan,
  getModuleDeepFactsForScan,
} from "@/lib/metrics/scanMetrics";
import {
  buildStructureFacts,
  filterStructureFactsForModule,
} from "@/lib/metrics/structureFacts";
import { buildExtendedEvidenceIndex } from "@/lib/evidence/catalog";
import { finalizeGovernanceContent } from "@/lib/governance/governancePlan";
import {
  compactModuleIntentRollupForPrompt,
  loadModuleIntentRollup,
} from "@/lib/governance/moduleIntentRollup";
import { computeStranglerCandidates } from "@/lib/db/federation";
import { getRepositoryForScanRun } from "@/lib/db/queries";
import {
  extractModuleRolesFromLlmJson,
  ensureDesignHypotheses,
  isParseTruncationError,
  normalizeReportEvidenceRefs,
  parseReportJson,
  syncEvidenceRefs,
  validateReport,
  sanitizeModuleRoles,
  sanitizeRefactoringRecommendations,
  sanitizeQuickWins,
} from "@/lib/validation/reportValidator";
import type { AiReportContent, ModuleRoleEntry } from "@/lib/types";
import {
  createDiagnoseRunLogger,
  formatMessagesForLog,
  logDiagnoseSystemEvent,
  type DiagnoseRunLogger,
} from "@/lib/jobs/diagnoseLogger";


export type { DiagnoseJobPayload, DiagnoseJobContext } from "@/lib/types";

/** Cap output tokens: very large values often cause slow/truncated provider responses */
const DIAGNOSIS_INITIAL_MAX_TOKENS = 8192;
const DIAGNOSIS_BATCH_MAX_TOKENS = 8192;

const MODULE_ROLES_COMPACT_RETRY_HINT =
  "上次 JSON 不完整或格式错误。请仅返回合法 JSON：{\"module_roles\":[...]}。" +
  "每个模块一条；responsibility_hypothesis 1-2 句；evidence 每模块 1 条；不要 Markdown 或其他字段。";

const JSON_PARSE_RETRY_HINT =
  "上次输出的 JSON 无法解析。请仅返回完整、合法的 JSON（report_version 2.0，简体中文）。不要 Markdown 或解释文字。";

const COMPACT_JSON_RETRY_HINT =
  "上次输出的 JSON 不完整或被截断。请仅返回完整、合法的 JSON（report_version 2.0，简体中文）。" +
  "module_roles 必须为 []；summary 不超过 4 句；" +
  "governance_plan.actions 3-5 条；ddd_governance.bounded_contexts 2 条；aggregates 可为 []；" +
  "risks、quick_wins、refactoring_recommendations 各不超过 2 条。不要 Markdown 或解释文字。";

const MODULE_INTENT_RETRY_HINT =
  "上次输出的 JSON 不完整或无法解析。请仅返回完整、合法的 JSON（report_version 2.0，简体中文）。" +
  "必须包含完整的 module_intent（purpose、≥2 business_capabilities、≥2 core_entities、≥1 key_workflow、external_interfaces）。" +
  "不要 Markdown 或解释文字。";

type DiagnoseChatOpts = LlmChatOptions & { json: true; maxTokens: number; step: string; attempt?: number };
type DiagnoseChatFn = (messages: LlmMessage[], opts: DiagnoseChatOpts) => Promise<string>;

function wrapChatWithLog(
  log: DiagnoseRunLogger,
  chat: (messages: LlmMessage[], options?: LlmChatOptions) => Promise<string>
): DiagnoseChatFn {
  return async (messages, opts) => {
    const attempt = opts.attempt ?? 1;
    const step = opts.step;
    return chat(messages, {
      ...opts,
      attempt,
      step,
      onExchange: (ev) => {
        log.section(`PROMPT ${ev.step} attempt=${ev.attempt}`, formatMessagesForLog(ev.requestMessages));
        log.section(`LLM_RAW ${ev.step} attempt=${ev.attempt}`, ev.responseText);
        log.info("llm_call", {
          step: ev.step,
          attempt: ev.attempt,
          duration_ms: ev.durationMs,
          max_tokens: ev.maxTokens,
          response_chars: ev.responseText.length,
          finish_reason: ev.finishReason,
          http_status: ev.httpStatus,
          error: ev.error,
        });
      },
    });
  };
}

function isModuleRolesValidationError(error: string): boolean {
  return error.includes("module_roles");
}

async function chatAndParseReport(
  messages: LlmMessage[],
  chat: DiagnoseChatFn,
  chatOpts: Omit<DiagnoseChatOpts, "step" | "attempt">,
  reportType: "project" | "module",
  log: DiagnoseRunLogger
): Promise<{ content: AiReportContent; raw: string; usedCompactRetry: boolean }> {
  let raw = await chat(messages, { ...chatOpts, step: "initial", attempt: 1 });
  let usedCompactRetry = false;

  try {
    const content = syncEvidenceRefs(parseReportJson(raw));
    log.info("parse_report", { step: "initial", attempt: 1, success: true });
    return { content, raw, usedCompactRetry };
  } catch (parseError) {
    const retryHint =
      reportType === "module"
        ? MODULE_INTENT_RETRY_HINT
        : isParseTruncationError(parseError)
          ? COMPACT_JSON_RETRY_HINT
          : JSON_PARSE_RETRY_HINT;
    if (reportType === "project") usedCompactRetry = true;

    log.info("parse_retry", {
      step: "initial",
      attempt: 1,
      retry_hint: reportType === "module" ? "module_intent" : isParseTruncationError(parseError) ? "compact" : "json_parse",
      error: parseError instanceof Error ? parseError.message : String(parseError),
    });

    raw = await chat(
      [
        ...messages,
        { role: "assistant", content: raw },
        { role: "user", content: retryHint },
      ],
      { ...chatOpts, step: "initial", attempt: 2 }
    );

    try {
      const content = syncEvidenceRefs(parseReportJson(raw));
      log.info("parse_report", { step: "initial", attempt: 2, success: true });
      return { content, raw, usedCompactRetry: true };
    } catch (retryParseError) {
      log.error("parse_report", retryParseError, { step: "initial", attempt: 2, success: false });
      throw new Error(
        retryParseError instanceof Error
          ? retryParseError.message
          : "JSON 解析失败（输出可能仍被截断，请换用更快模型后重试）"
      );
    }
  }
}

function buildReportIssues(
  issues: Awaited<ReturnType<typeof getIssuesForScan>>,
  moduleIdToName: Map<string, string>
): ReportIssueInput[] {
  return issues.map((i) => ({
    id: i.id,
    rule_id: i.rule_id,
    severity: i.severity,
    message: i.message,
    module_names: i.module_ids
      .map((id) => moduleIdToName.get(id))
      .filter((n): n is string => Boolean(n)),
  }));
}

async function parseModuleRolesFromRaw(
  raw: string,
  messages: LlmMessage[],
  chat: DiagnoseChatFn,
  chatOpts: Omit<DiagnoseChatOpts, "step" | "attempt">,
  log: DiagnoseRunLogger,
  batchLabel: string
): Promise<ModuleRoleEntry[]> {
  let current = raw;
  const retryHints = [JSON_PARSE_RETRY_HINT, MODULE_ROLES_COMPACT_RETRY_HINT];

  for (let attempt = 0; attempt <= retryHints.length; attempt++) {
    try {
      const parsed = syncEvidenceRefs(parseReportJson(current));
      const roles = extractModuleRolesFromLlmJson(parsed);
      log.info("parse_report", {
        step: `module_roles_${batchLabel}`,
        attempt: attempt + 1,
        success: true,
        raw_roles_count: parsed.module_roles?.length ?? 0,
        normalized_roles_count: roles.length,
      });
      return roles;
    } catch (parseError) {
      if (attempt >= retryHints.length) {
        log.error("parse_report", parseError, {
          step: `module_roles_${batchLabel}`,
          attempt: attempt + 1,
          success: false,
        });
        throw parseError;
      }
      const hint = isParseTruncationError(parseError)
        ? MODULE_ROLES_COMPACT_RETRY_HINT
        : retryHints[attempt];
      log.info("parse_retry", {
        step: `module_roles_${batchLabel}`,
        attempt: attempt + 1,
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      current = await chat(
        [
          ...messages,
          { role: "assistant", content: current },
          { role: "user", content: hint },
        ],
        { ...chatOpts, step: `module_roles_${batchLabel}`, attempt: attempt + 2 }
      );
    }
  }

  throw new Error("JSON 解析失败");
}

async function fillModuleRolesForNames(
  batchNames: string[],
  content: AiReportContent,
  structure: Awaited<ReturnType<typeof buildStructureFacts>>,
  summaries: Awaited<ReturnType<typeof getSummariesForScan>>,
  moduleDeepFacts: Awaited<ReturnType<typeof getModuleDeepFactsForScan>>,
  projectName: string,
  chat: DiagnoseChatFn,
  chatOpts: Omit<DiagnoseChatOpts, "step" | "attempt">,
  log: DiagnoseRunLogger,
  batchLabel: string
): Promise<AiReportContent> {
  const batchModules = structure.modules.filter((m) => batchNames.includes(m.name));
  const { system, user } = buildModuleRolesBatchPrompt({
    projectName,
    modules: batchModules,
    summaries: summaries.map((s) => ({
      module_name: s.module_name,
      top_types: s.top_types as string[],
    })),
    module_deep_facts: moduleDeepFacts,
  });

  const messages: LlmMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  log.info("module_roles_batch", {
    batch: batchLabel,
    module_names: batchNames,
    module_count: batchNames.length,
  });
  log.section(`PROMPT module_roles_${batchLabel} built`, formatMessagesForLog(messages));

  let raw: string;
  try {
    raw = await chat(messages, { ...chatOpts, step: `module_roles_${batchLabel}`, attempt: 1 });
  } catch (firstError) {
    log.info("module_roles_batch_retry", { batch: batchLabel, reason: "chat_error" });
    try {
      raw = await chat(messages, { ...chatOpts, step: `module_roles_${batchLabel}`, attempt: 2 });
    } catch {
      throw firstError;
    }
  }

  try {
    const batchRoles = await parseModuleRolesFromRaw(
      raw,
      messages,
      chat,
      chatOpts,
      log,
      batchLabel
    );
    return mergeModuleRoles(content, batchRoles, structure);
  } catch (parseError) {
    if (batchNames.length <= 1) throw parseError;

    log.info("module_roles_batch_split", {
      batch: batchLabel,
      module_names: batchNames,
      reason: "parse_failed",
    });

    let merged = content;
    const mid = Math.ceil(batchNames.length / 2);
    const leftLabel = `${batchLabel}a`;
    const rightLabel = `${batchLabel}b`;
    merged = await fillModuleRolesForNames(
      batchNames.slice(0, mid),
      merged,
      structure,
      summaries,
      moduleDeepFacts,
      projectName,
      chat,
      chatOpts,
      log,
      leftLabel
    );
    merged = await fillModuleRolesForNames(
      batchNames.slice(mid),
      merged,
      structure,
      summaries,
      moduleDeepFacts,
      projectName,
      chat,
      chatOpts,
      log,
      rightLabel
    );
    return merged;
  }
}

async function fillModuleRolesBatches(
  content: AiReportContent,
  structure: Awaited<ReturnType<typeof buildStructureFacts>>,
  summaries: Awaited<ReturnType<typeof getSummariesForScan>>,
  moduleDeepFacts: Awaited<ReturnType<typeof getModuleDeepFactsForScan>>,
  projectName: string,
  chat: DiagnoseChatFn,
  chatOpts: Omit<DiagnoseChatOpts, "step" | "attempt">,
  log: DiagnoseRunLogger,
  options?: { allModules?: boolean }
): Promise<AiReportContent> {
  let result = content;
  let missing = options?.allModules
    ? structure.modules.map((m) => m.name)
    : getMissingModuleNames(result, structure);
  let batchIndex = 0;
  const maxBatches = Math.max(
    20,
    Math.ceil(structure.modules.length / MODULE_BATCH_SIZE) * 4
  );

  while (missing.length > 0) {
    if (batchIndex >= maxBatches) {
      throw new Error(
        `模块职责分批生成超过上限（${maxBatches} 批），仍有 ${missing.length} 个模块未覆盖。请检查 LLM 配置与返回内容。`
      );
    }

    const missingBefore = missing.join("\0");
    const rolesBefore = result.module_roles?.length ?? 0;
    const batchNames = missing.slice(0, MODULE_BATCH_SIZE);
    const batchLabel = String(batchIndex++);
    result = await fillModuleRolesForNames(
      batchNames,
      result,
      structure,
      summaries,
      moduleDeepFacts,
      projectName,
      chat,
      chatOpts,
      log,
      batchLabel
    );
    missing = getMissingModuleNames(result, structure);

    if (
      missing.join("\0") === missingBefore &&
      (result.module_roles?.length ?? 0) === rolesBefore
    ) {
      log.error("module_roles_batch_stalled", new Error("no progress"), {
        missing_count: missing.length,
        missing_modules: missing.slice(0, 10),
      });
      throw new Error(
        `模块职责分批生成无进展（仍有 ${missing.length} 个模块未覆盖，例如：${missing.slice(0, 3).join("、")}）。` +
          "LLM 返回的 JSON 可能缺少 module_roles 或未使用 module_name 字段（勿用 module）。" +
          "请重试；若仍失败请更换模型（如 deepseek-chat、gpt-4o）并确认 API Key 有效。"
      );
    }
  }

  return result;
}


export async function processDiagnoseJob(
  payload: DiagnoseJobPayload,
  context?: DiagnoseJobContext
): Promise<string> {
  const scanRunId = payload.scan_run_id;
  const reportType = payload.report_type ?? "project";
  const focusModuleName = payload.module_name;

  const log = createDiagnoseRunLogger({
    jobId: context?.jobId,
    scanRunId,
    reportType,
    moduleName: focusModuleName,
  });

  log.info("job_start", {
    job_id: context?.jobId,
    worker_id: context?.workerId,
    scan_run_id: scanRunId,
    report_type: reportType,
    module_name: focusModuleName,
    payload,
  });

  let reportRow: { id: string } | null = null;

  try {
    const overview = await log.time("data_load_scan_overview", () => getScanOverview(scanRunId));
    if (!overview) throw new Error("Scan run not found");

    const repo = await getRepositoryForScanRun(scanRunId);
    const metrics = await getMetricsForScan(scanRunId);
    const issues = await getIssuesForScan(scanRunId);
    const summaries = await getSummariesForScan(scanRunId);
    const moduleDeepFacts = await getModuleDeepFactsForScan(scanRunId);
    const scanModules = await getModulesForScan(scanRunId);
    const strangler = await computeStranglerCandidates(scanRunId);

    const moduleIdToName = new Map(scanModules.map((m) => [m.id, m.name]));
    const reportIssues = buildReportIssues(issues, moduleIdToName);

    let structure = await buildStructureFacts(scanRunId);
    if (reportType === "module" && focusModuleName) {
      structure = filterStructureFactsForModule(structure, focusModuleName);
    }

    const moduleContext =
      reportType === "module" && focusModuleName
        ? await buildModuleContextPack(scanRunId, focusModuleName)
        : null;

    if (reportType === "module" && focusModuleName && !moduleContext) {
      throw new Error(`Module not found: ${focusModuleName}`);
    }

    log.info("data_load", {
      modules: scanModules.length,
      metrics: metrics.length,
      issues: issues.length,
      summaries: summaries.length,
      structure_module_count: structure.modules.length,
      strangler_count: strangler.length,
    });

    reportRow = await queryOne<{ id: string }>(
      `INSERT INTO diagnostic_reports (scan_run_id, status, report_type)
       VALUES ($1, 'running', $2) RETURNING id`,
      [scanRunId, reportType]
    );
    if (!reportRow) throw new Error("Failed to create report");

    log.setReportId(reportRow.id);
    log.info("report_created", { report_id: reportRow.id });

    const evidenceIndex = buildExtendedEvidenceIndex(metrics, issues, structure);
    for (const s of strangler) {
      evidenceIndex.set(`module:${s.module_name}`, true);
    }
    indexAllModuleTypeEvidence(
      evidenceIndex,
      moduleDeepFacts,
      summaries.map((s) => ({
        module_name: s.module_name,
        top_types: s.top_types as string[],
      }))
    );

    let publicTypeNames: Set<string> | undefined;
    if (moduleContext) {
      publicTypeNames = indexModuleTypeEvidence(evidenceIndex, moduleContext);
    }

    const summaryInput = summaries.map((s) => ({
      module_name: s.module_name,
      top_types: s.top_types as string[],
    }));

    const deferModuleRoles = reportType === "project";

    const moduleIntentRollup =
      reportType === "project" ? await loadModuleIntentRollup(scanRunId) : [];

    if (moduleIntentRollup.length > 0) {
      log.info("module_intent_rollup", {
        count: moduleIntentRollup.length,
        modules: moduleIntentRollup.map((r) => r.module_name),
      });
    }

    const promptInput =
      reportType === "module" && moduleContext
        ? buildModuleIntentPrompt({
            projectName: repo?.name ?? "Unknown",
            solutionPath: overview.scan.solution_path ?? "",
            healthScore: overview.healthScore,
            context: moduleContext,
          })
        : buildDiagnosisPrompt({
            reportType,
            focusModuleName,
            projectName: repo?.name ?? "Unknown",
            solutionPath: overview.scan.solution_path ?? "",
            healthScore: overview.healthScore,
            issueCounts: overview.issueCounts,
            structure,
            issues: reportIssues,
            metrics: metrics.map((m) => ({
              id: m.id,
              code: m.code,
              module_name: m.module_name,
              value: Number(m.value),
            })),
            summaries: summaryInput,
            module_deep_facts: moduleDeepFacts,
            deferModuleRoles,
            module_intent_rollup: compactModuleIntentRollupForPrompt(moduleIntentRollup),
          });

    const { system, user } = promptInput;

    log.info("prompt_build", {
      system_chars: system.length,
      user_chars: user.length,
      defer_module_roles: deferModuleRoles,
    });
    log.section("PROMPT system", system);
    log.section("PROMPT user", user);

    const llm = await createLlmProvider();
    const profileMax = llm.profile?.maxTokens ?? 4096;
    const initialMaxTokens = Math.min(profileMax, DIAGNOSIS_INITIAL_MAX_TOKENS);
    const batchMaxTokens = Math.min(profileMax, DIAGNOSIS_BATCH_MAX_TOKENS);
    const initialChatOpts = { json: true as const, maxTokens: initialMaxTokens };
    const batchChatOpts = { json: true as const, maxTokens: batchMaxTokens };

    log.info("llm_profile", {
      model: llm.profile?.model,
      base_url: llm.profile?.baseUrl,
      profile_max_tokens: profileMax,
      initial_max_tokens: initialMaxTokens,
      batch_max_tokens: batchMaxTokens,
      has_api_key: Boolean(llm.profile?.apiKey),
      api_key_suffix: llm.profile?.apiKey ? llm.profile.apiKey.slice(-4) : undefined,
      profile_name: llm.profile?.name,
    });

    if (!llm.profile?.apiKey) {
      throw new Error(
        "LLM API Key 未配置。请在「系统设置 → 大模型配置」中填写 API Key 与模型信息后重新生成报告。"
      );
    }

    const chat = wrapChatWithLog(log, llm.provider.chat.bind(llm.provider));
    const baseMessages: LlmMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    let validationErrors: string[] = [];
    const projectName = repo?.name ?? "Unknown";

    const parsed = await chatAndParseReport(
      baseMessages,
      chat,
      initialChatOpts,
      reportType === "module" ? "module" : "project",
      log
    );
    let content = parsed.content;
    const usedCompactRetry = parsed.usedCompactRetry;

    const rolesBeforeEnrich = content.module_roles?.length ?? 0;
    content = enrichReportContent(
      content,
      structure,
      overview.healthScore,
      reportType === "project" ? reportIssues : []
    );
    log.info("enrich_content", {
      module_roles_before: rolesBeforeEnrich,
      module_roles_after: content.module_roles?.length ?? 0,
    });

    if (!content.strangler_candidates?.length) {
      content.strangler_candidates = strangler.map((s) => ({
        module_name: s.module_name,
        score: s.score,
        rationale: s.rationale,
        evidence: [
          {
            ref: `module:${s.module_name}`,
            label: s.module_name,
            kind: "fact" as const,
          },
        ],
        evidence_refs: [`module:${s.module_name}`],
      }));
    }

    if (deferModuleRoles) {
      content.module_roles = [];
    }

    const needsModuleRoles =
      reportType === "project" &&
      (deferModuleRoles ||
        usedCompactRetry ||
        getMissingModuleNames(content, structure).length > 0);

    if (needsModuleRoles) {
      content = await fillModuleRolesBatches(
        content,
        structure,
        summaries,
        moduleDeepFacts,
        projectName,
        chat,
        batchChatOpts,
        log,
        { allModules: deferModuleRoles }
      );
    }

    if (reportType === "project") {
      content.module_roles = sanitizeModuleRoles(content.module_roles, structure);
    }

    content = syncEvidenceRefs(
      normalizeReportEvidenceRefs(ensureDesignHypotheses(content, structure), structure)
    );

    content.quick_wins = sanitizeQuickWins(content.quick_wins);
    content.refactoring_recommendations = sanitizeRefactoringRecommendations(
      content.refactoring_recommendations
    );

    content = finalizeGovernanceContent(
      content,
      structure,
      overview.healthScore,
      structure.issue_count,
      reportType === "project",
      {
        moduleRollup: moduleIntentRollup,
        issues: reportType === "project" ? reportIssues : undefined,
      }
    );
    content = syncEvidenceRefs(normalizeReportEvidenceRefs(content, structure));

    const validationOpts = {
      publicTypeNames,
      moduleReport: reportType === "module",
      structure: reportType === "project" ? structure : undefined,
    };

    let validation = validateReport(
      content,
      evidenceIndex,
      structure.issue_count,
      validationOpts
    );
    log.info("validate", { valid: validation.valid, errors: validation.errors });

    if (!validation.valid) {
      if (
        reportType === "project" &&
        validation.errors.some((e) => isModuleRolesValidationError(e))
      ) {
        content = await fillModuleRolesBatches(
          content,
          structure,
          summaries,
          moduleDeepFacts,
          projectName,
          chat,
          batchChatOpts,
          log,
          { allModules: deferModuleRoles }
        );
        content.module_roles = sanitizeModuleRoles(content.module_roles, structure);
        validation = validateReport(content, evidenceIndex, structure.issue_count, validationOpts);
        log.info("validate", { pass: "module_roles_refill", valid: validation.valid, errors: validation.errors });
      }

      const nonModuleErrors = validation.errors.filter(
        (e) => !isModuleRolesValidationError(e)
      );
      if (nonModuleErrors.length > 0) {
        try {
          log.info("validate_fix", { errors: nonModuleErrors });
          const fixRaw = await chat(
            [
              {
                role: "system",
                content:
                  "你是架构报告修正器。仅返回修正后的紧凑 JSON（report_version 2.0，简体中文）。module_roles 必须为 []。",
              },
              {
                role: "user",
                content: `请修正以下问题：${nonModuleErrors.join("；")}。保留已有 summary 含义。${COMPACT_JSON_RETRY_HINT}`,
              },
            ],
            { ...batchChatOpts, step: "validate_fix", attempt: 1 }
          );
          const fixed = syncEvidenceRefs(parseReportJson(fixRaw));
          content = {
            ...content,
            summary: fixed.summary ?? content.summary,
            executive_summary: fixed.executive_summary ?? content.executive_summary,
            governance_plan: fixed.governance_plan ?? content.governance_plan,
            ddd_governance: fixed.ddd_governance ?? content.ddd_governance,
            module_ddd_profile: fixed.module_ddd_profile ?? content.module_ddd_profile,
            design_hypotheses: fixed.design_hypotheses ?? content.design_hypotheses,
            risks: fixed.risks ?? content.risks,
            quick_wins: fixed.quick_wins ?? content.quick_wins,
            refactoring_recommendations:
              fixed.refactoring_recommendations ?? content.refactoring_recommendations,
            strangler_candidates: fixed.strangler_candidates ?? content.strangler_candidates,
            strangler_roadmap: fixed.strangler_roadmap ?? content.strangler_roadmap,
          };
          content = enrichReportContent(
            content,
            structure,
            overview.healthScore,
            reportIssues
          );
          if (deferModuleRoles) {
            content.module_roles = content.module_roles ?? [];
          }
          if (getMissingModuleNames(content, structure).length > 0) {
            content = await fillModuleRolesBatches(
              content,
              structure,
              summaries,
              moduleDeepFacts,
              projectName,
              chat,
              batchChatOpts,
              log,
              { allModules: deferModuleRoles }
            );
          }
          content.module_roles = sanitizeModuleRoles(content.module_roles, structure);
          content.quick_wins = sanitizeQuickWins(content.quick_wins);
          content.refactoring_recommendations = sanitizeRefactoringRecommendations(
            content.refactoring_recommendations
          );
          content = finalizeGovernanceContent(
            content,
            structure,
            overview.healthScore,
            structure.issue_count,
            reportType === "project",
            {
              moduleRollup: moduleIntentRollup,
              issues: reportType === "project" ? reportIssues : undefined,
            }
          );
          content = syncEvidenceRefs(normalizeReportEvidenceRefs(content, structure));
          validation = validateReport(
            content,
            evidenceIndex,
            structure.issue_count,
            validationOpts
          );
          log.info("validate_fix", { success: true, valid: validation.valid, errors: validation.errors });
        } catch (fixError) {
          log.error("validate_fix", fixError, { success: false });
        }
      }

      validationErrors = validation.errors;
    }

    const markdown = reportToMarkdown(content, {
      projectName,
      solutionPath: overview.scan.solution_path ?? undefined,
      reportStatus: validationErrors.length ? "partial" : "completed",
    });
    const status = validationErrors.length ? "partial" : "completed";

    await query(
      `UPDATE diagnostic_reports
       SET status = $2, content = $3, validation_errors = $4, markdown = $5, finished_at = now()
       WHERE id = $1`,
      [
        reportRow.id,
        status,
        JSON.stringify(content),
        JSON.stringify(validationErrors),
        markdown,
      ]
    );

    log.info("finalize_db", {
      report_id: reportRow.id,
      status,
      validation_errors: validationErrors,
      markdown_chars: markdown.length,
    });

    for (const rec of content.refactoring_recommendations ?? []) {
      await query(
        `INSERT INTO refactoring_recommendations (report_id, effort, category, title, description, evidence_refs)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          reportRow.id,
          rec.effort,
          rec.category,
          rec.title,
          rec.description,
          JSON.stringify(rec.evidence_refs ?? rec.evidence?.map((e) => e.ref) ?? []),
        ]
      );
    }

    log.info("job_success", { report_id: reportRow.id, status });
    log.finalize(status === "completed" ? "completed" : "partial", {
      report_id: reportRow.id,
      validation_errors: validationErrors,
    });

    return reportRow.id;
  } catch (error) {
    const message = normalizeLlmError(error);
    log.error("job_failed", error, { normalized: message });
    if (reportRow) {
      await query(
        `UPDATE diagnostic_reports SET status = 'failed', validation_errors = $2, finished_at = now() WHERE id = $1`,
        [reportRow.id, JSON.stringify([message])]
      );
    }
    log.finalize("failed", {
      report_id: reportRow?.id,
      normalized_error: message,
    });
    throw new Error(message);
  }
}

/** Jobs stuck in running (e.g. dev server reload) block the queue until reclaimed */
