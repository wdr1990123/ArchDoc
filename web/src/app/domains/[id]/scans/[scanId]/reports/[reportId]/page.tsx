import { notFound } from "next/navigation";
import { getDomain, getRepositoryForScanRun } from "@/lib/db/queries";
import { getReport } from "@/lib/jobs/diagnoseJob";
import {
  getIssuesForScan,
  getMetricsForScan,
} from "@/lib/metrics/scanMetrics";
import { buildStructureFacts } from "@/lib/metrics/structureFacts";
import { buildEvidenceCatalog } from "@/lib/evidence/catalog";
import { Card, Badge, BackLink } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ReportContentTabs } from "@/components/ReportContentTabs";
import { ReportEvidenceSidebar } from "@/components/EvidencePanel";
import { buildScanBreadcrumbs } from "@/lib/nav/breadcrumbs";
import { zh, statusLabel } from "@/lib/i18n/zh";
import type { AiReportContent, EvidenceCatalogEntry } from "@/lib/types";

function collectAllEvidence(content: AiReportContent): EvidenceCatalogEntry[] {
  const seen = new Set<string>();
  const list: EvidenceCatalogEntry[] = [];

  const add = (items?: Array<{ ref: string; label?: string; kind?: string; confidence?: string }>) => {
    for (const item of items ?? []) {
      if (seen.has(item.ref)) continue;
      seen.add(item.ref);
      list.push({
        ref: item.ref,
        label: item.label ?? item.ref,
        kind: (item.kind as "fact" | "inference") ?? "fact",
        confidence: item.confidence as EvidenceCatalogEntry["confidence"],
      });
    }
  };

  for (const r of content.risks ?? []) add(r.evidence);
  for (const q of content.quick_wins ?? []) add(q.evidence);
  for (const rec of content.refactoring_recommendations ?? []) add(rec.evidence);
  for (const c of content.key_dependency_chains ?? []) add(c.evidence);
  for (const role of content.module_roles ?? []) add(role.evidence);
  const intent = content.module_intent;
  if (intent) {
    add(intent.evidence);
    for (const wf of intent.key_workflows ?? []) add(wf.evidence);
    for (const iface of intent.external_interfaces ?? []) add(iface.evidence);
  }
  for (const step of content.strangler_roadmap ?? []) add(step.evidence);
  for (const item of content.issue_interpretations ?? []) add(item.evidence);
  for (const action of content.governance_plan?.actions ?? []) add(action.evidence);
  for (const bc of content.ddd_governance?.bounded_contexts ?? []) add(bc.evidence);

  return list;
}

export default async function ReportPage({
  params,
}: {
  params: { id: string; scanId: string; reportId: string };
}) {
  const domain = await getDomain(params.id);
  if (!domain) notFound();

  const data = await getReport(params.reportId);
  if (!data) notFound();

  const repository = await getRepositoryForScanRun(params.scanId);
  const repoName = repository?.name ?? zh.breadcrumb.scan;

  const report = data as {
    id: string;
    status: string;
    report_type: string;
    markdown: string | null;
    validation_errors: unknown[];
    content: AiReportContent;
  };

  const [structure, issues, metrics] = await Promise.all([
    buildStructureFacts(params.scanId),
    getIssuesForScan(params.scanId),
    getMetricsForScan(params.scanId),
  ]);

  const catalog = buildEvidenceCatalog(params.id, params.scanId, structure, issues, metrics);
  const sidebarItems = collectAllEvidence(report.content).map(
    (item) => ({ ...catalog.get(item.ref), ...item, link: catalog.get(item.ref)?.link }) as EvidenceCatalogEntry
  );

  const downloadFilename = `架构诊断报告-${repoName}-${params.reportId.slice(0, 8)}.md`;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={buildScanBreadcrumbs({
          domainId: params.id,
          domainName: domain.name,
          scanId: params.scanId,
          repositoryName: repoName,
          currentPage: zh.scan.reportTitle,
        })}
      />
      <BackLink href={`/domains/${params.id}/scans/${params.scanId}`}>
        {zh.scan.backToOverview}
      </BackLink>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{zh.scan.reportTitle}</h1>
        <Badge tone={report.status === "completed" ? "success" : "medium"}>
          {statusLabel(report.status)}
        </Badge>
        {report.content.report_version === "2.0" && (
          <Badge tone="default">Report V2</Badge>
        )}
        {report.report_type === "module" && (
          <Badge tone="default">{zh.scan.moduleReport}</Badge>
        )}
      </div>

      {Array.isArray(report.validation_errors) && report.validation_errors.length > 0 && (
        <Card
          className={
            report.status === "failed"
              ? "border-red-200 bg-red-50"
              : "border-amber-200 bg-amber-50"
          }
        >
          <p
            className={`text-sm font-medium ${
              report.status === "failed" ? "text-red-900" : "text-amber-900"
            }`}
          >
            {report.status === "failed" ? zh.scan.reportFailed : zh.scan.validationWarn}
          </p>
          <ul
            className={`mt-2 space-y-1 text-sm ${
              report.status === "failed" ? "text-red-800" : "text-amber-800"
            }`}
          >
            {report.validation_errors.map((err, i) => (
              <li key={i}>{typeof err === "string" ? err : JSON.stringify(err)}</li>
            ))}
          </ul>
        </Card>
      )}

      {report.status !== "failed" && (
        <>
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <Card className="max-w-none">
              <ReportContentTabs
                content={report.content}
                catalog={catalog}
                markdown={report.markdown}
                reportType={report.report_type}
                downloadFilename={downloadFilename}
              />
            </Card>
            <ReportEvidenceSidebar catalogEntries={sidebarItems} />
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500">{zh.scan.rawJson}</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
              {JSON.stringify(report.content, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
