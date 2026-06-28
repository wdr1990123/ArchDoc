import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { getDomain, getRepositoryForScanRun } from "@/lib/db/queries";
import { getReport } from "@/lib/jobs/diagnoseJob";
import { Card, Badge, BackLink } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { buildScanBreadcrumbs } from "@/lib/nav/breadcrumbs";
import { zh, statusLabel } from "@/lib/i18n/zh";

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
    markdown: string | null;
    validation_errors: unknown[];
    content: Record<string, unknown>;
  };

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

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{zh.scan.reportTitle}</h1>
        <Badge tone={report.status === "completed" ? "success" : "medium"}>
          {statusLabel(report.status)}
        </Badge>
      </div>

      {Array.isArray(report.validation_errors) && report.validation_errors.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-900">{zh.scan.validationWarn}</p>
          <pre className="mt-2 overflow-x-auto text-xs text-amber-800">
            {JSON.stringify(report.validation_errors, null, 2)}
          </pre>
        </Card>
      )}

      <Card className="prose prose-sm prose-slate max-w-none">
        {report.markdown ? (
          <ReactMarkdown>{report.markdown}</ReactMarkdown>
        ) : (
          <pre className="text-xs">{JSON.stringify(report.content, null, 2)}</pre>
        )}
      </Card>

      <details className="text-sm">
        <summary className="cursor-pointer text-slate-500">{zh.scan.rawJson}</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
          {JSON.stringify(report.content, null, 2)}
        </pre>
      </details>
    </div>
  );
}
