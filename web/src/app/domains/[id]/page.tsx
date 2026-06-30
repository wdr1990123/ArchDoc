import Link from "next/link";
import { notFound } from "next/navigation";
import { getDomain, listRepositoriesByDomain, listScanRunsByDomain, getDomainProgress } from "@/lib/db/queries";
import { listDomainSnapshots } from "@/lib/db/federation";
import { Card, Badge, PageHeader, NavLink, EmptyState } from "@/components/layout/ui";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { DomainProgressBar } from "@/components/shared/DomainProgressBar";
import { DomainActions } from "@/components/domains/DomainActions";
import { DeleteDomainButton } from "@/components/domains/DeleteDomainButton";
import { homeCrumb, domainCrumb } from "@/lib/nav/breadcrumbs";
import { zh, statusLabel, formatDateTime } from "@/lib/i18n/zh";

export default async function DomainPage({
  params,
}: {
  params: { id: string };
}) {
  const domain = await getDomain(params.id);
  if (!domain) notFound();

  const repositories = await listRepositoriesByDomain(params.id);
  const scanRuns = await listScanRunsByDomain(params.id);
  const snapshots = await listDomainSnapshots(params.id);
  const progress = await getDomainProgress(params.id);

  return (
    <div className="space-y-8">
      <Breadcrumbs items={[homeCrumb(), domainCrumb(params.id, domain.name)]} />
      <PageHeader
        title={domain.name}
        description={domain.description ?? undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <NavLink href={`/domains/${params.id}/repositories`}>{zh.domain.repos}</NavLink>
          <NavLink href={`/domains/${params.id}/federation`}>{zh.domain.federation}</NavLink>
          <DeleteDomainButton domainId={params.id} domainName={domain.name} />
        </div>
      </PageHeader>

      <DomainProgressBar
        progress={{
          domainId: params.id,
          hasRepository: progress.hasRepository,
          hasScan: progress.hasScan,
          hasDiagnosis: progress.hasDiagnosis,
          latestScanId: progress.latestScanId,
        }}
      />

      <DomainActions domainId={params.id} scanRuns={scanRuns} />

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{zh.domain.recentScans}</h2>
        <div className="space-y-2">
          {scanRuns.map((sr) => (
            <Link key={sr.id} href={`/domains/${params.id}/scans/${sr.id}`}>
              <Card className="flex items-center justify-between transition hover:border-slate-300">
                <div>
                  <p className="font-medium text-slate-900">{sr.repository_name}</p>
                  <p className="text-xs text-slate-500">
                    {sr.solution_path ?? "—"} · {formatDateTime(sr.created_at)}
                  </p>
                </div>
                <Badge tone={sr.status === "completed" ? "success" : "default"}>
                  {statusLabel(sr.status)}
                </Badge>
              </Card>
            </Link>
          ))}
          {scanRuns.length === 0 && <EmptyState>{zh.domain.noScans}</EmptyState>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {zh.domain.repositories}（{repositories.length}）
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {repositories.map((r) => (
            <Link key={r.id} href={`/domains/${params.id}/repositories#repo-${r.id}`}>
              <Card className="transition hover:border-slate-300 hover:shadow-sm">
                <p className="font-medium text-slate-900">{r.name}</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-500">{r.id}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {snapshots.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            {zh.domain.federationSnapshots}
          </h2>
          {snapshots.map((s) => (
            <Link
              key={s.id}
              href={`/domains/${params.id}/federation?snapshot=${s.id}`}
            >
              <Card className="mb-2 flex items-center justify-between transition hover:border-slate-300 hover:shadow-sm">
                <p className="font-medium text-slate-900">{s.name}</p>
                <Badge tone={s.status === "completed" ? "success" : "default"}>
                  {statusLabel(s.status)}
                </Badge>
              </Card>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
