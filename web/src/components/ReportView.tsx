"use client";

import Link from "next/link";
import type {
  AiReportContent,
  EvidenceCatalogEntry,
  GovernanceAction,
  IssueInterpretation,
} from "@/lib/types";
import { ContextMapGraph } from "@/components/ContextMapGraph";
import { EvidencePanel } from "@/components/EvidencePanel";
import { Badge } from "@/components/ui";
import { severityLabel, zh } from "@/lib/i18n/zh";

const CONFIDENCE_ZH: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const EFFORT_ZH: Record<string, string> = { S: "小", M: "中", L: "大" };

const VERDICT_ZH: Record<string, string> = {
  proceed: zh.scan.verdictProceed,
  watch: zh.scan.verdictWatch,
  intervene: zh.scan.verdictIntervene,
};

const PHASE_ZH: Record<string, string> = {
  short: zh.scan.phaseShort,
  mid: zh.scan.phaseMid,
  long: zh.scan.phaseLong,
};

const SUBDOMAIN_ZH: Record<string, string> = {
  core: zh.scan.subdomainCore,
  supporting: zh.scan.subdomainSupporting,
  generic: zh.scan.subdomainGeneric,
};

const CONTEXT_TYPE_ZH: Record<string, string> = {
  existing: zh.scan.contextTypeExisting,
  recommended_split: zh.scan.contextTypeSplit,
  recommended_merge: zh.scan.contextTypeMerge,
};

const PRIORITY_TONE: Record<string, "high" | "medium" | "default"> = {
  urgent: "high",
  important: "medium",
  normal: "default",
};

function SectionBadge({ kind }: { kind: "fact" | "ai" }) {
  return (
    <Badge tone={kind === "fact" ? "default" : "medium"}>
      {kind === "fact" ? zh.scan.factsBadge : zh.scan.aiBadge}
    </Badge>
  );
}

function resolveEvidence(
  items: AiReportContent["risks"][0]["evidence"],
  legacy: string[] | undefined,
  catalog: Map<string, EvidenceCatalogEntry>
): EvidenceCatalogEntry[] {
  const refs = new Set<string>();
  const result: EvidenceCatalogEntry[] = [];

  for (const item of items ?? []) {
    if (refs.has(item.ref)) continue;
    refs.add(item.ref);
    result.push({ ...catalog.get(item.ref), ...item, link: catalog.get(item.ref)?.link });
  }
  for (const ref of legacy ?? []) {
    if (refs.has(ref)) continue;
    refs.add(ref);
    result.push(
      catalog.get(ref) ?? {
        ref,
        label: ref,
        kind: "fact",
      }
    );
  }
  return result;
}

function truncateText(text: string, max = 56): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function resolveLinkedIssue(
  ref: string,
  catalog: Map<string, EvidenceCatalogEntry>,
  byRef: Map<string, IssueInterpretation>
) {
  const interp = byRef.get(ref);
  const entry = catalog.get(ref);
  const ruleMatch = entry?.detail?.match(/^\[([^\]]+)\]/);
  return {
    ref,
    ruleId: interp?.rule_id ?? ruleMatch?.[1] ?? "unknown",
    message: interp?.message ?? entry?.label ?? ref,
    severity: interp?.severity ?? "medium",
    link: entry?.link,
  };
}

function LinkedIssuesList({
  refs,
  catalog,
  issueInterpretations,
}: {
  refs: string[];
  catalog: Map<string, EvidenceCatalogEntry>;
  issueInterpretations?: IssueInterpretation[];
}) {
  if (!refs.length) return null;

  const byRef = new Map((issueInterpretations ?? []).map((i) => [i.issue_ref, i]));
  const items = refs.map((ref) => resolveLinkedIssue(ref, catalog, byRef));

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const list = groups.get(item.ruleId) ?? [];
    list.push(item);
    groups.set(item.ruleId, list);
  }

  const useGrouped = refs.length > 5 || groups.size < refs.length;

  if (useGrouped) {
    return (
      <details className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-slate-700">
          {zh.scan.linkedIssuesSummary
            .replace("{count}", String(refs.length))
            .replace("{rules}", String(groups.size))}
        </summary>
        <ul className="mt-2 space-y-2">
          {Array.from(groups.entries()).map(([ruleId, group]) => {
            const sample = group[0];
            const ruleLink =
              catalog.get(`rule:${ruleId}`)?.link ??
              sample.link?.replace(/issueId=[^&]+/, `ruleId=${encodeURIComponent(ruleId)}`);
            return (
              <li key={ruleId} className="text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  {ruleLink ? (
                    <Link
                      href={ruleLink}
                      className="font-mono font-medium text-indigo-700 hover:underline"
                    >
                      {ruleId}
                    </Link>
                  ) : (
                    <span className="font-mono font-medium text-slate-800">{ruleId}</span>
                  )}
                  <Badge tone={group.some((g) => g.severity === "critical" || g.severity === "high") ? "high" : "medium"}>
                    ×{group.length}
                  </Badge>
                </div>
                <p className="mt-0.5 text-slate-600">{truncateText(sample.message)}</p>
              </li>
            );
          })}
        </ul>
      </details>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-slate-700">{zh.scan.linkedIssues}</p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <li key={item.ref} className="flex flex-wrap items-start gap-2 text-xs">
            <Badge
              tone={
                item.severity === "critical" || item.severity === "high" ? "high" : "medium"
              }
            >
              {severityLabel(item.severity)}
            </Badge>
            <span className="font-mono text-slate-500">{item.ruleId}</span>
            {item.link ? (
              <Link href={item.link} className="min-w-0 flex-1 text-slate-700 hover:text-indigo-700 hover:underline">
                {truncateText(item.message)}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 text-slate-700">{truncateText(item.message)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GovernanceActionCard({
  action,
  catalog,
  issueInterpretations,
}: {
  action: GovernanceAction;
  catalog: Map<string, EvidenceCatalogEntry>;
  issueInterpretations?: IssueInterpretation[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-500">{action.id}</span>
        <h4 className="font-semibold text-slate-900">{action.title}</h4>
        <Badge tone={PRIORITY_TONE[action.priority] ?? "default"}>
          {action.priority === "urgent"
            ? zh.scan.priorityUrgent
            : action.priority === "important"
              ? zh.scan.priorityImportant
              : zh.scan.priorityNormal}
        </Badge>
        <Badge tone="default">{action.category}</Badge>
        <Badge tone="medium">工作量 {EFFORT_ZH[action.effort] ?? action.effort}</Badge>
        <Badge tone="medium">{PHASE_ZH[action.target_phase] ?? action.target_phase}</Badge>
      </div>
      <p className="mt-2 text-sm text-slate-700">{action.description}</p>
      {action.rationale && action.rationale !== action.description && (
        <p className="mt-1 text-sm text-slate-600">依据：{action.rationale}</p>
      )}
      {action.target_modules?.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">目标模块：{action.target_modules.join("、")}</p>
      )}
      {action.acceptance_criteria?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-700">{zh.scan.acceptanceCriteria}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
            {action.acceptance_criteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {action.linked_issues && action.linked_issues.length > 0 && (
        <LinkedIssuesList
          refs={action.linked_issues}
          catalog={catalog}
          issueInterpretations={issueInterpretations}
        />
      )}
      <EvidencePanel items={resolveEvidence(action.evidence, action.evidence_refs, catalog)} />
    </div>
  );
}

function ExecutiveSummaryPanel({ content }: { content: AiReportContent }) {
  const es = content.executive_summary;
  if (!es) {
    return (
      <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <p className="text-sm leading-relaxed text-slate-700">{content.summary}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{zh.scan.governanceSummary}</h2>
        <Badge tone={es.governance_verdict === "intervene" ? "high" : "medium"}>
          {zh.scan.governanceVerdict}：{VERDICT_ZH[es.governance_verdict] ?? es.governance_verdict}
        </Badge>
      </div>
      {es.ddd_boundary_conclusion && (
        <p className="mt-3 text-sm font-medium text-indigo-900">{es.ddd_boundary_conclusion}</p>
      )}
      {es.top_actions?.length > 0 && (
        <ol className="mt-4 space-y-2">
          {es.top_actions.map((a) => (
            <li key={a.id} className="text-sm text-slate-800">
              <span className="font-mono text-xs text-slate-500">{a.id}</span>{" "}
              <strong>{a.title}</strong>
              <span className="text-slate-500">
                {" "}
                · {EFFORT_ZH[a.effort as keyof typeof EFFORT_ZH] ?? a.effort}
              </span>
              {a.expected_outcome && (
                <span className="block text-slate-600">→ {a.expected_outcome}</span>
              )}
            </li>
          ))}
        </ol>
      )}
      {es.defer_items?.length ? (
        <div className="mt-4 rounded-lg bg-slate-100/80 px-3 py-2">
          <p className="text-xs font-medium text-slate-600">{zh.scan.deferItems}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
            {es.defer_items.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function DddGovernanceSection({
  content,
  catalog,
}: {
  content: AiReportContent;
  catalog: Map<string, EvidenceCatalogEntry>;
}) {
  const ddd = content.ddd_governance;
  if (!ddd) return null;

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{zh.scan.dddSection}</h2>
        <SectionBadge kind="ai" />
      </div>
      {ddd.strategy_notes && (
        <p className="text-sm text-slate-600">{ddd.strategy_notes}</p>
      )}

      {ddd.subdomain_landscape?.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-slate-900">{zh.scan.subdomainLandscape}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {ddd.subdomain_landscape.map((sub) => (
              <div key={sub.name} className="rounded-lg border border-violet-100 bg-violet-50/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{sub.name}</span>
                  <Badge tone="medium">{SUBDOMAIN_ZH[sub.classification] ?? sub.classification}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-700">{sub.rationale}</p>
                {sub.related_modules?.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">{(sub.related_modules ?? []).join("、")}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {ddd.bounded_contexts?.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-slate-900">{zh.scan.boundedContexts}</h3>
          <div className="mt-3 space-y-4">
            {ddd.bounded_contexts.map((bc) => (
              <div
                key={bc.name}
                className="rounded-lg border border-dashed border-violet-200 bg-violet-50/30 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-slate-900">{bc.name}</h4>
                  <Badge tone="medium">
                    {CONTEXT_TYPE_ZH[bc.context_type] ?? bc.context_type}
                  </Badge>
                  <Badge tone="medium">
                    置信度 {CONFIDENCE_ZH[bc.confidence] ?? bc.confidence}
                  </Badge>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-800">{bc.business_capability}</p>
                <p className="mt-1 text-sm text-slate-700">{bc.boundary_rationale}</p>
                <p className="mt-2 text-xs text-slate-500">模块：{(bc.modules ?? []).join("、")}</p>
                {bc.ubiquitous_language?.length > 0 && (
                  <p className="mt-1 text-xs text-slate-600">
                    通用语言：{bc.ubiquitous_language.join("、")}
                  </p>
                )}
                <EvidencePanel items={resolveEvidence(bc.evidence, undefined, catalog)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {ddd.context_map?.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-slate-900">{zh.scan.contextMap}</h3>
          <div className="mt-3">
            <ContextMapGraph ddd={ddd} />
          </div>
        </div>
      )}

      {ddd.aggregates?.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-slate-900">{zh.scan.aggregates}</h3>
          <div className="mt-3 space-y-3">
            {ddd.aggregates.map((agg) => (
              <div key={agg.name} className="rounded-lg border border-slate-200 p-3">
                <h4 className="font-medium text-slate-900">
                  {agg.name}
                  <span className="text-slate-500"> · {agg.bounded_context}</span>
                </h4>
                <p className="mt-1 text-sm text-slate-700">
                  聚合根：<code className="text-xs">{agg.aggregate_root.ref}</code>
                </p>
                {agg.invariants?.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
                    {agg.invariants.map((inv) => (
                      <li key={inv}>{inv}</li>
                    ))}
                  </ul>
                )}
                <EvidencePanel items={resolveEvidence(agg.evidence, undefined, catalog)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {ddd.modeling_gaps && ddd.modeling_gaps.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-slate-900">{zh.scan.modelingGaps}</h3>
          <ul className="mt-2 space-y-2">
            {ddd.modeling_gaps.map((gap) => (
              <li key={gap.title} className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm">
                <strong>{gap.title}</strong>（{gap.kind}）
                <p className="text-slate-700">{gap.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ModuleDddProfileSection({
  profile,
  catalog,
}: {
  profile: NonNullable<AiReportContent["module_ddd_profile"]>;
  catalog: Map<string, EvidenceCatalogEntry>;
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-base font-semibold text-slate-900">{zh.scan.moduleDddProfile}</h3>
      <p className="text-sm text-slate-700">
        限界上下文：<strong>{profile.bounded_context_membership.context_name}</strong>（
        {profile.bounded_context_membership.role_in_context}）
      </p>
      {profile.aggregate_candidates?.length > 0 && (
        <div className="space-y-2">
          {profile.aggregate_candidates.map((c) => (
            <div key={c.ref} className="rounded-lg border border-slate-200 p-3 text-sm">
              <strong>{c.type_name}</strong>（{c.role}）：{c.rationale}
              <EvidencePanel items={resolveEvidence(c.evidence, undefined, catalog)} />
            </div>
          ))}
        </div>
      )}
      {profile.boundary_recommendations?.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-800">{zh.scan.boundaryRecommendations}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
            {profile.boundary_recommendations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DiagnosticsSection({
  content,
  catalog,
  isModuleReport,
}: {
  content: AiReportContent;
  catalog: Map<string, EvidenceCatalogEntry>;
  isModuleReport: boolean;
}) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50/50">
      <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-900 marker:content-none">
        <span className="inline-flex items-center gap-2">
          <span className="text-slate-400 transition group-open:rotate-90">▶</span>
          {zh.scan.diagnosticsEvidence}
          <SectionBadge kind="fact" />
        </span>
      </summary>
      <div className="space-y-8 border-t border-slate-200 px-5 pb-5 pt-4">
        {!isModuleReport && content.architecture_overview && (
          <section>
            <h3 className="text-base font-semibold text-slate-900">架构总览</h3>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">模块数</dt>
                <dd className="font-medium">{content.architecture_overview.module_count}</dd>
              </div>
              <div>
                <dt className="text-slate-500">健康分</dt>
                <dd className="font-medium">{content.architecture_overview.health_score}/100</dd>
              </div>
            </dl>
          </section>
        )}

        {content.issue_interpretations && content.issue_interpretations.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-slate-900">{zh.scan.issueInterpretations}</h3>
            <div className="mt-3 space-y-3">
              {content.issue_interpretations.map((item) => (
                <div key={item.issue_ref} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <span className="font-medium">{item.rule_id}</span>
                  <Badge tone="medium">{severityLabel(item.severity)}</Badge>
                  <p className="mt-1 text-slate-700">{item.interpretation}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {content.key_dependency_chains && content.key_dependency_chains.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-slate-900">关键依赖链</h3>
            <div className="mt-3 space-y-3">
              {content.key_dependency_chains.map((chain, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <p className="font-medium">
                    {chain.path?.length ? chain.path.join(" → ") : chain.reason}
                  </p>
                  <EvidencePanel items={resolveEvidence(chain.evidence, undefined, catalog)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {content.module_roles && content.module_roles.length > 0 && (
          <section>
            <h3 className="text-base font-semibold text-slate-900">模块职责表</h3>
            <div className="mt-3 space-y-2">
              {content.module_roles.map((role) => (
                <div key={role.module_name} className="text-sm text-slate-700">
                  <strong>{role.module_name}</strong>：{role.responsibility_hypothesis}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </details>
  );
}

export function ReportView({
  content,
  catalog,
  reportType = "project",
}: {
  content: AiReportContent;
  catalog: Map<string, EvidenceCatalogEntry>;
  reportType?: string;
}) {
  const isModuleReport = reportType === "module";
  const actions = content.governance_plan?.actions ?? [];

  return (
    <div className="space-y-10">
      <ExecutiveSummaryPanel content={content} />

      {!isModuleReport && <DddGovernanceSection content={content} catalog={catalog} />}

      {isModuleReport && content.module_ddd_profile && (
        <ModuleDddProfileSection profile={content.module_ddd_profile} catalog={catalog} />
      )}

      {content.governance_plan && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{zh.scan.governanceActions}</h2>
            <SectionBadge kind="ai" />
          </div>
          {content.governance_plan.phases?.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {content.governance_plan.phases.map((phase) => (
                <div key={phase.phase} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {phase.title || PHASE_ZH[phase.phase]}
                  </p>
                  {phase.objectives?.[0] && (
                    <p className="mt-1 text-xs text-slate-600">{phase.objectives[0]}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="space-y-4">
            {actions.map((action) => (
              <GovernanceActionCard
                key={action.id}
                action={action}
                catalog={catalog}
                issueInterpretations={content.issue_interpretations}
              />
            ))}
          </div>
        </section>
      )}

      {content.module_intent && (
        <section>
          <h3 className="text-base font-semibold text-slate-900">{zh.scan.moduleIntent}</h3>
          <div className="mt-3 rounded-lg border border-dashed border-violet-200 bg-violet-50/40 p-4">
            <h4 className="font-semibold text-slate-900">{content.module_intent.module_name}</h4>
            <p className="mt-2 text-sm text-slate-700">{content.module_intent.purpose}</p>
            {content.module_intent.business_capabilities?.length ? (
              <ul className="mt-3 list-inside list-disc text-sm text-slate-700">
                {content.module_intent.business_capabilities.map((cap) => (
                  <li key={cap}>{cap}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      )}

      {content.risks?.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-slate-900">主要风险</h3>
          <div className="mt-3 space-y-3">
            {content.risks.map((risk) => (
              <div key={risk.title} className="rounded-lg border border-slate-200 p-3 text-sm">
                <strong>{risk.title}</strong>
                <Badge tone="medium">{severityLabel(risk.severity)}</Badge>
                <p className="mt-1 text-slate-700">{risk.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {content.strangler_roadmap && content.strangler_roadmap.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-slate-900">绞杀者迁移路线图</h3>
          <ol className="mt-3 space-y-2">
            {content.strangler_roadmap.map((step) => (
              <li key={step.phase} className="text-sm text-slate-700">
                <strong>
                  阶段 {step.phase}：{step.title}
                </strong>
                — {step.rationale}
              </li>
            ))}
          </ol>
        </section>
      )}

      <DiagnosticsSection
        content={content}
        catalog={catalog}
        isModuleReport={isModuleReport}
      />
    </div>
  );
}
