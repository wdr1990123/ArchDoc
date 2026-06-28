import { notFound } from "next/navigation";
import { getDomain } from "@/lib/db/queries";
import { listDomainSnapshots, getFederationGraph } from "@/lib/db/federation";
import { Card, Badge, BackLink, EmptyState } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DependencyGraph } from "@/components/DependencyGraph";
import { zh, statusLabel } from "@/lib/i18n/zh";
import { domainCrumb, homeCrumb } from "@/lib/nav/breadcrumbs";

export default async function FederationPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { snapshot?: string };
}) {
  const domain = await getDomain(params.id);
  if (!domain) notFound();

  const snapshots = await listDomainSnapshots(params.id);
  const activeSnapshot = searchParams.snapshot ?? snapshots[0]?.id;
  const graph = activeSnapshot ? await getFederationGraph(activeSnapshot) : null;
  const activeSnapshotName =
    snapshots.find((s) => s.id === activeSnapshot)?.name ?? zh.federation.title;

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          homeCrumb(),
          domainCrumb(params.id, domain.name),
          { label: zh.federation.title },
        ]}
      />
      <BackLink href={`/domains/${params.id}`}>{zh.federation.back}</BackLink>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{zh.federation.title}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {zh.federation.desc} — {domain.name}
          {snapshots.length > 0 && ` · ${activeSnapshotName}`}
        </p>
      </div>

      {snapshots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {snapshots.map((s) => (
            <a
              key={s.id}
              href={`/domains/${params.id}/federation?snapshot=${s.id}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                activeSnapshot === s.id
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              {s.name}
            </a>
          ))}
        </div>
      )}

      {snapshots.length === 0 && <EmptyState>{zh.federation.empty}</EmptyState>}

      {graph && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone={graph.snapshot.status === "completed" ? "success" : "default"}>
              {statusLabel(graph.snapshot.status)}
            </Badge>
            <span className="text-sm text-slate-600">
              {graph.crossRepoDependencies?.length ?? 0} {zh.federation.crossDeps}
            </span>
          </div>
          <DependencyGraph nodes={graph.nodes} edges={graph.edges} height={420} />
        </Card>
      )}
    </div>
  );
}
