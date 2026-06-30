import { BackLink, PageHeader, Card } from "@/components/layout/ui";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { getDomain, listRepositoriesByDomain } from "@/lib/db/queries";
import { notFound } from "next/navigation";
import { AddRepositoryForm } from "@/components/repositories/AddRepositoryForm";
import { RepositoryScanPanel } from "@/components/repositories/RepositoryScanPanel";
import { zh } from "@/lib/i18n/zh";
import { domainCrumb, homeCrumb } from "@/lib/nav/breadcrumbs";

export default async function RepositoriesPage({
  params,
}: {
  params: { id: string };
}) {
  const domain = await getDomain(params.id);
  if (!domain) notFound();

  const repositories = await listRepositoriesByDomain(params.id);

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          homeCrumb(),
          domainCrumb(params.id, domain.name),
          { label: zh.repo.title },
        ]}
      />
      <BackLink href={`/domains/${params.id}`}>{zh.repo.back}</BackLink>
      <PageHeader
        title={zh.repo.title}
        description={`${zh.domain.label}：${domain.name}`}
      />

      <div id="add" className="scroll-mt-8">
        <AddRepositoryForm domainId={params.id} />
      </div>

      <div id="scan" className="scroll-mt-8 space-y-6">
        {repositories.length === 0 && (
          <p className="text-sm text-slate-500">请先添加上方代码仓库，再执行扫描。</p>
        )}
        {repositories.map((repo) => (
          <Card key={repo.id} id={`repo-${repo.id}`} className="scroll-mt-8">
            <h3 className="font-semibold text-slate-900">{repo.name}</h3>
            <p className="mt-1 break-all font-mono text-xs text-slate-500">{repo.id}</p>
            <div className="mt-4">
              <RepositoryScanPanel
                domainId={params.id}
                repositoryId={repo.id}
                solutionPath={repo.solution_path ?? ""}
                repoName={repo.name}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
