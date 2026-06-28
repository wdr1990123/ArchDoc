import type { AiReportContent } from "@/lib/types";

const SEVERITY_ZH: Record<string, string> = {
  critical: "严重",
  high: "高",
  medium: "中",
  low: "低",
};

const EFFORT_ZH: Record<string, string> = {
  S: "小",
  M: "中",
  L: "大",
};

export function buildDiagnosisPrompt(input: {
  projectName: string;
  solutionPath: string;
  healthScore: number;
  issueCounts: Record<string, number>;
  topModules: Array<{ name: string; ce: number; ca: number; issueCount: number }>;
  issues: Array<{ id: string; rule_id: string; severity: string; message: string }>;
  metrics: Array<{ id: string; code: string; module_name: string | null; value: number }>;
  summaries: Array<{ module_name: string; top_types: string[]; snippet: string }>;
}): { system: string; user: string } {
  const system = `你是一位资深 .NET 架构师，正在审查 MES 系统的架构健康状况。

硬性规则：
- 结论必须仅基于提供的指标、问题与模块摘要，不得臆造。
- 每条风险与建议必须包含 evidence_refs，引用 issue:id、metric:id 或 rule:RULE_ID。
- 不得编造输入中不存在的模块、类或依赖关系。
- 若证据不足，在 summary 中说明「证据不足」。
- 所有面向用户的文本字段（summary、title、description、rationale 等）必须使用简体中文。
- severity 字段仍使用英文枚举：critical | high | medium | low。
- effort 字段仍使用英文枚举：S | M | L。
- 仅输出合法 JSON，不要附加 Markdown 或解释文字。`;

  const user = `请分析以下 .NET 解决方案并生成架构诊断报告（全部使用简体中文撰写内容字段）。

项目：${input.projectName}
解决方案：${input.solutionPath}
健康分：${input.healthScore}/100
问题统计：${JSON.stringify(input.issueCounts)}

高风险模块 Top：
${JSON.stringify(input.topModules, null, 2)}

架构问题（evidence_refs 中使用 "issue:{id}"）：
${JSON.stringify(input.issues.slice(0, 15), null, 2)}

指标（evidence_refs 中使用 "metric:{id}" 或 "metric_code:{code}"）：
${JSON.stringify(input.metrics.slice(0, 30), null, 2)}

模块摘要：
${JSON.stringify(input.summaries.slice(0, 10), null, 2)}

返回 JSON，结构如下（内容字段请用中文）：
{
  "summary": "3-5 句总体概述",
  "risks": [{"title":"","severity":"critical|high|medium|low","description":"","evidence_refs":[]}],
  "quick_wins": [{"title":"","description":"","effort":"S|M|L","evidence_refs":[]}],
  "refactoring_recommendations": [{"title":"","category":"","description":"","effort":"S|M|L","evidence_refs":[],"module_name":""}],
  "strangler_candidates": [{"module_name":"","score":0,"rationale":"","evidence_refs":[]}]
}`;

  return { system, user };
}

export function reportToMarkdown(content: AiReportContent): string {
  const lines: string[] = [];
  lines.push("# 架构诊断报告\n");
  lines.push(`## 总体概述\n\n${content.summary}\n`);

  if (content.risks?.length) {
    lines.push("## 主要风险\n");
    for (const r of content.risks) {
      const sev = SEVERITY_ZH[r.severity] ?? r.severity;
      lines.push(`### ${r.title}（${sev}）\n\n${r.description}\n`);
      lines.push(`证据：${r.evidence_refs.join(", ")}\n`);
    }
  }

  if (content.quick_wins?.length) {
    lines.push("## 快速改进项\n");
    for (const q of content.quick_wins) {
      const effort = EFFORT_ZH[q.effort] ?? q.effort;
      lines.push(`- **${q.title}** [工作量：${effort}]：${q.description}`);
    }
    lines.push("");
  }

  if (content.refactoring_recommendations?.length) {
    lines.push("## 重构建议\n");
    for (const rec of content.refactoring_recommendations) {
      const effort = EFFORT_ZH[rec.effort] ?? rec.effort;
      lines.push(
        `### ${rec.title}\n\n**类别：** ${rec.category} | **工作量：** ${effort}\n\n${rec.description}\n`
      );
    }
  }

  if (content.strangler_candidates?.length) {
    lines.push("## 绞杀者模式候选模块\n");
    for (const c of content.strangler_candidates) {
      lines.push(`- **${c.module_name}**（评分：${c.score}）：${c.rationale}`);
    }
  }

  return lines.join("\n");
}
