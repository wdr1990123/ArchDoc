import { notFound } from "next/navigation";
import { getDomain, getRepositoryForScanRun, getScanRun } from "@/lib/db/queries";
import { getGraphForScan } from "@/lib/metrics/scanMetrics";
import { Card, BackLink } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ScanSubNav } from "@/components/ScanSubNav";
import { DependencyGraph } from "@/components/DependencyGraph";
import { buildScanBreadcrumbs } from "@/lib/nav/breadcrumbs";
import { zh } from "@/lib/i18n/zh";

export default async function GraphPage({
  params,
  searchParams,
}: {
  params: { id: string; scanId: string };
  searchParams: { highlight?: string };
}) {
  const domain = await getDomain(params.id);
  if (!domain) notFound();

  const scan = await getScanRun(params.scanId);
  if (!scan) notFound();

  const repository = await getRepositoryForScanRun(params.scanId);
  const graph = await getGraphForScan(params.scanId);
  const repoName = repository?.name ?? zh.breadcrumb.scan;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={buildScanBreadcrumbs({
          domainId: params.id,
          domainName: domain.name,
          scanId: params.scanId,
          repositoryName: repoName,
          currentPage: zh.scan.graph,
        })}
      />
      <BackLink href={`/domains/${params.id}/scans/${params.scanId}`}>
        {zh.scan.backToOverview}
      </BackLink>

      <h1 className="text-2xl font-bold text-slate-900">{zh.scan.graphTitle}</h1>

      <ScanSubNav domainId={params.id} scanId={params.scanId} active="graph" />

      <Card>
        <p className="mb-4 text-sm text-slate-600">
          {graph.moduleCount} 个模块 · {graph.edgeCount} 条依赖 · 红色节点表示处于循环依赖中
          {searchParams.highlight ? " · 蓝色高亮为报告引用模块" : ""}
        </p>
        <DependencyGraph
          nodes={graph.nodes}
          edges={graph.edges}
          highlightModuleId={searchParams.highlight}
        />
      </Card>
    </div>
  );
}
