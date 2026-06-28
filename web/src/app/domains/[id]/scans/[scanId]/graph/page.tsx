import { notFound } from "next/navigation";
import { getScanRun } from "@/lib/db/queries";
import { getGraphForScan } from "@/lib/metrics/scanMetrics";
import { Card, BackLink } from "@/components/ui";
import { DependencyGraph } from "@/components/DependencyGraph";
import { zh } from "@/lib/i18n/zh";

export default async function GraphPage({
  params,
}: {
  params: { id: string; scanId: string };
}) {
  const scan = await getScanRun(params.scanId);
  if (!scan) notFound();

  const graph = await getGraphForScan(params.scanId);

  return (
    <div className="space-y-6">
      <BackLink href={`/domains/${params.id}/scans/${params.scanId}`}>
        {zh.scan.back}
      </BackLink>
      <h1 className="text-2xl font-bold text-slate-900">{zh.scan.graphTitle}</h1>
      <Card>
        <p className="mb-4 text-sm text-slate-600">
          {graph.moduleCount} 个模块 · {graph.edgeCount} 条依赖 · 红色节点表示处于循环依赖中
        </p>
        <DependencyGraph nodes={graph.nodes} edges={graph.edges} />
      </Card>
    </div>
  );
}
