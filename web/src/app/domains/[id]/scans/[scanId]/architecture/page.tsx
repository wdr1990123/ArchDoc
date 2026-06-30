import Link from "next/link";
import { notFound } from "next/navigation";
import { getDomain, getRepositoryForScanRun, getScanRun } from "@/lib/db/queries";
import { buildStructureFacts } from "@/lib/metrics/structureFacts";
import { getLatestModuleReportMap } from "@/lib/metrics/moduleContextPack";
import { Card, Badge, BackLink } from "@/components/layout/ui";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ScanSubNav } from "@/components/scans/ScanSubNav";
import { ModuleDiagnoseButton } from "@/components/scans/ModuleDiagnoseButton";
import { buildScanBreadcrumbs } from "@/lib/nav/breadcrumbs";
import { zh } from "@/lib/i18n/zh";

export default async function ArchitecturePage({
  params,
}: {
  params: { id: string; scanId: string };
}) {
  const domain = await getDomain(params.id);
  if (!domain) notFound();

  const scan = await getScanRun(params.scanId);
  if (!scan) notFound();

  const repository = await getRepositoryForScanRun(params.scanId);
  const [structure, moduleReports] = await Promise.all([
    buildStructureFacts(params.scanId),
    getLatestModuleReportMap(params.scanId),
  ]);
  const repoName = repository?.name ?? zh.breadcrumb.scan;
  const hasDeepRead = scan.schema_version === "1.1" || scan.schema_version === "1.2";

  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  for (const d of structure.dependencies) {
    outbound.set(d.from, (outbound.get(d.from) ?? 0) + 1);
    inbound.set(d.to, (inbound.get(d.to) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={buildScanBreadcrumbs({
          domainId: params.id,
          domainName: domain.name,
          scanId: params.scanId,
          repositoryName: repoName,
          currentPage: zh.scan.architecture,
        })}
      />
      <BackLink href={`/domains/${params.id}/scans/${params.scanId}`}>
        {zh.scan.backToOverview}
      </BackLink>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{zh.scan.architectureTitle}</h1>
        <p className="mt-1 text-sm text-slate-600">{zh.scan.architectureDesc}</p>
      </div>

      <ScanSubNav domainId={params.id} scanId={params.scanId} active="architecture" />

      {!hasDeepRead && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-900">{zh.scan.deepReadWarn}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">模块数</p>
          <p className="mt-1 text-3xl font-bold">{structure.total_modules}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">代码行数</p>
          <p className="mt-1 text-3xl font-bold">
            {structure.total_loc.toLocaleString("zh-CN")}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Issue 数</p>
          <p className="mt-1 text-3xl font-bold">{structure.issue_count}</p>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold text-slate-900">{zh.scan.layerDistribution}</h2>
        <div className="mt-4 space-y-3">
          {Object.entries(structure.layer_distribution).map(([layer, mods]) => (
            <div key={layer} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <Badge tone="default">{layer}</Badge>
              <p className="mt-2 text-sm text-slate-700">{mods.join("、")}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">{zh.scan.keyChains}</h2>
        {structure.key_dependency_chains.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">未检测到关键依赖链</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {structure.key_dependency_chains.map((chain, i) => (
              <li key={i} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium text-slate-900">
                  {chain.path.length ? chain.path.join(" → ") : chain.reason}
                </p>
                <p className="mt-1 text-xs text-slate-500">{chain.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-slate-900">{zh.scan.moduleTable}</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2 pr-4">模块</th>
                <th className="py-2 pr-4">分层</th>
                <th className="py-2 pr-4">LOC</th>
                <th className="py-2 pr-4">Ce/Ca</th>
                <th className="py-2 pr-4">{zh.scan.inbound}/{zh.scan.outbound}</th>
                <th className="py-2 pr-4">Issue</th>
                <th className="py-2 pr-4">职责推断</th>
                <th className="py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {structure.modules.map((mod) => {
                const report = moduleReports.get(mod.name);
                return (
                <tr
                  key={mod.id}
                  id={`module-${encodeURIComponent(mod.name)}`}
                  className="border-b border-slate-100 scroll-mt-24"
                >
                  <td className="py-3 pr-4 font-medium text-slate-900">{mod.name}</td>
                  <td className="py-3 pr-4">
                    <Badge tone="default">{mod.layer}</Badge>
                  </td>
                  <td className="py-3 pr-4">{mod.loc.toLocaleString("zh-CN")}</td>
                  <td className="py-3 pr-4">
                    {mod.ce} / {mod.ca}
                  </td>
                  <td className="py-3 pr-4">
                    {inbound.get(mod.name) ?? 0} / {outbound.get(mod.name) ?? 0}
                  </td>
                  <td className="py-3 pr-4">{mod.issue_count}</td>
                  <td className="max-w-xs py-3 pr-4">
                    {report?.purpose ? (
                      <p className="line-clamp-2 text-xs text-slate-600">{report.purpose}</p>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/domains/${params.id}/scans/${params.scanId}/graph?highlight=${mod.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        依赖图
                      </Link>
                      {report ? (
                        <Link
                          href={`/domains/${params.id}/scans/${params.scanId}/reports/${report.id}`}
                          className="text-xs text-violet-700 hover:underline"
                        >
                          {zh.scan.viewModuleReport}
                        </Link>
                      ) : null}
                      <ModuleDiagnoseButton
                        scanId={params.scanId}
                        domainId={params.id}
                        moduleId={mod.id}
                        moduleName={mod.name}
                      />
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {structure.package_refs.length > 0 && (
        <Card>
          <h2 className="font-semibold text-slate-900">NuGet 包引用</h2>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {structure.package_refs.slice(0, 40).map((p) => (
              <li key={p.ref}>
                {p.module_name} → {p.package_id} {p.version && `@ ${p.version}`}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
