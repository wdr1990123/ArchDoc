import Link from "next/link";
import { notFound } from "next/navigation";
import { getScanOverview } from "@/lib/metrics/scanMetrics";
import { getReportsForScan } from "@/lib/jobs/diagnoseJob";
import { getDomain, getRepositoryForScanRun, getScanRun } from "@/lib/db/queries";
import { computeStranglerCandidates } from "@/lib/db/federation";
import { Card, Badge, BackLink } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ScanSubNav } from "@/components/ScanSubNav";
import { HealthRadar } from "@/components/HealthRadar";
import { DiagnoseButton } from "./DiagnoseButton";
import { buildScanBreadcrumbs } from "@/lib/nav/breadcrumbs";
import { zh, severityLabel, statusLabel, formatDateTime } from "@/lib/i18n/zh";

export default async function ScanDetailPage({
  params,
}: {
  params: { id: string; scanId: string };
}) {
  const domain = await getDomain(params.id);
  if (!domain) notFound();

  const scan = await getScanRun(params.scanId);
  if (!scan) notFound();

  const overview = await getScanOverview(params.scanId);
  const repository = await getRepositoryForScanRun(params.scanId);
  const reports = await getReportsForScan(params.scanId);
  const strangler = await computeStranglerCandidates(params.scanId);

  if (!overview) notFound();

  const repoName = repository?.name ?? zh.breadcrumb.scan;

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={buildScanBreadcrumbs({
          domainId: params.id,
          domainName: domain.name,
          scanId: params.scanId,
          repositoryName: repoName,
        })}
      />
      <BackLink href={`/domains/${params.id}`}>{zh.scan.back}</BackLink>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{zh.scan.overview}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {repository?.name} · {scan.solution_path}
        </p>
      </div>

      <ScanSubNav domainId={params.id} scanId={params.scanId} active="overview" />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">{zh.scan.healthScore}</p>
          <p className="mt-1 text-4xl font-bold text-slate-900">{overview.healthScore}</p>
          <p className="mt-1 text-xs text-slate-400">满分 100</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">{zh.scan.modules}</p>
          <p className="mt-1 text-4xl font-bold">{overview.totalModules}</p>
          <p className="text-xs text-slate-400">
            {overview.totalLoc.toLocaleString("zh-CN")} {zh.scan.loc}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">{zh.scan.issuesSummary}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {overview.issueCounts.critical > 0 && (
              <Badge tone="critical">
                {severityLabel("critical")} {overview.issueCounts.critical}
              </Badge>
            )}
            {overview.issueCounts.high > 0 && (
              <Badge tone="high">
                {severityLabel("high")} {overview.issueCounts.high}
              </Badge>
            )}
            {overview.issueCounts.medium > 0 && (
              <Badge tone="medium">
                {severityLabel("medium")} {overview.issueCounts.medium}
              </Badge>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold text-slate-900">{zh.scan.radar}</h2>
          <HealthRadar
            dimensions={overview.radar.dimensions}
            values={overview.radar.values}
          />
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold text-slate-900">{zh.scan.topRisk}</h2>
          <ul className="space-y-2">
            {overview.topRiskModules.map((m) => (
              <li
                key={m.module.id}
                className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm"
              >
                <p className="font-medium text-slate-900">{m.module.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  传出 {m.ce} · 传入 {m.ca} · {m.issueCount} 个问题 · 风险分{" "}
                  {Math.round(m.riskScore)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">{zh.scan.aiTitle}</h2>
            <p className="mt-1 text-xs text-slate-500">
              使用系统设置中的默认诊断模型，可在「系统设置」配置多个模型
            </p>
          </div>
          <DiagnoseButton scanId={params.scanId} domainId={params.id} />
        </div>
        {reports.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-500">{zh.scan.reports}</p>
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/domains/${params.id}/scans/${params.scanId}/reports/${r.id}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {formatDateTime(r.created_at)} — {statusLabel(r.status)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-slate-900">{zh.scan.strangler}</h2>
        <ul className="space-y-2">
          {strangler.map((c) => (
            <li
              key={c.module_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="font-medium">{c.module_name}</span>
              <span className="text-slate-600">
                {zh.scan.score} {c.score}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
