import Link from "next/link";
import { notFound } from "next/navigation";
import { getDomain, getRepositoryForScanRun, getScanRun } from "@/lib/db/queries";
import { getIssuesForScan, getModulesForScan } from "@/lib/metrics/scanMetrics";
import { getLatestProjectReport } from "@/lib/jobs/diagnoseJob";
import { buildIssueActionMap } from "@/lib/governance/governancePlan";
import type { AiReportContent } from "@/lib/types";
import { Card, Badge, BackLink, EmptyState } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ScanSubNav } from "@/components/ScanSubNav";
import { buildScanBreadcrumbs } from "@/lib/nav/breadcrumbs";
import { zh, severityLabel } from "@/lib/i18n/zh";

const SEVERITIES = ["", "critical", "high", "medium", "low"] as const;

function parseReportContent(raw: unknown): AiReportContent | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as AiReportContent;
}

export default async function IssuesPage({
  params,
  searchParams,
}: {
  params: { id: string; scanId: string };
  searchParams: { severity?: string; issueId?: string; ruleId?: string };
}) {
  const domain = await getDomain(params.id);
  if (!domain) notFound();

  const scan = await getScanRun(params.scanId);
  if (!scan) notFound();

  const repository = await getRepositoryForScanRun(params.scanId);
  const issues = await getIssuesForScan(params.scanId, searchParams.severity);
  const modules = await getModulesForScan(params.scanId);
  const moduleMap = new Map(modules.map((m) => [m.id, m.name]));
  const repoName = repository?.name ?? zh.breadcrumb.scan;

  const latestReport = await getLatestProjectReport(params.scanId);
  const reportContent = parseReportContent(latestReport?.content);
  const issueActionMap = reportContent ? buildIssueActionMap(reportContent) : new Map();

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={buildScanBreadcrumbs({
          domainId: params.id,
          domainName: domain.name,
          scanId: params.scanId,
          repositoryName: repoName,
          currentPage: zh.scan.issues,
        })}
      />
      <BackLink href={`/domains/${params.id}/scans/${params.scanId}`}>
        {zh.scan.backToOverview}
      </BackLink>

      <h1 className="text-2xl font-bold text-slate-900">{zh.scan.issuesTitle}</h1>

      <ScanSubNav domainId={params.id} scanId={params.scanId} active="issues" />

      <div className="flex flex-wrap gap-2">
        {SEVERITIES.map((s) => {
          const active =
            searchParams.severity === s || (!searchParams.severity && !s);
          return (
            <Link
              key={s || "all"}
              href={`/domains/${params.id}/scans/${params.scanId}/issues${
                s ? `?severity=${s}` : ""
              }`}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                active
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              {s ? severityLabel(s) : zh.severity.all}
            </Link>
          );
        })}
      </div>

      <div className="space-y-3">
        {issues.map((issue) => {
          const highlighted =
            searchParams.issueId === issue.id ||
            searchParams.ruleId === issue.rule_id;
          const linkedActions = issueActionMap.get(`issue:${issue.id}`) ?? [];
          return (
            <Card
              key={issue.id}
              className={highlighted ? "ring-2 ring-blue-400 ring-offset-1" : undefined}
            >
              <div className="flex items-start gap-3">
                <Badge tone={issue.severity as "critical" | "high" | "medium" | "low"}>
                  {severityLabel(issue.severity)}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-slate-500">{issue.rule_id}</p>
                  <p className="mt-1 text-sm text-slate-800">{issue.message}</p>
                  {issue.module_ids.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      相关模块：{" "}
                      {issue.module_ids.map((mid) => moduleMap.get(mid) ?? mid).join("、")}
                    </p>
                  )}
                  {linkedActions.length > 0 && latestReport && (
                    <div className="mt-3 rounded-lg bg-indigo-50/60 px-3 py-2">
                      <p className="text-xs font-medium text-indigo-900">
                        {zh.scan.linkedGovernanceActions}
                      </p>
                      <ul className="mt-1 space-y-1 text-sm text-indigo-800">
                        {linkedActions.map((action) => (
                          <li key={action.id}>
                            <Link
                              href={`/domains/${params.id}/scans/${params.scanId}/reports/${latestReport.id}`}
                              className="hover:underline"
                            >
                              {action.id} {action.title}
                            </Link>
                            <span className="text-indigo-600/80"> · {action.priority}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {issues.length === 0 && <EmptyState>暂无匹配的问题</EmptyState>}
      </div>
    </div>
  );
}
