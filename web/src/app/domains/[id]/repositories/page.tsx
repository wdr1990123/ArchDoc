import { BackLink, PageHeader } from "@/components/ui";
import { getDomain } from "@/lib/db/queries";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { AddRepositoryForm } from "./AddRepositoryForm";
import { zh } from "@/lib/i18n/zh";

export default async function RepositoriesPage({
  params,
}: {
  params: { id: string };
}) {
  const domain = await getDomain(params.id);
  if (!domain) notFound();

  return (
    <div className="space-y-8">
      <BackLink href={`/domains/${params.id}`}>{zh.repo.back}</BackLink>
      <PageHeader
        title={zh.repo.title}
        description={`诊断域：${domain.name}`}
      />

      <AddRepositoryForm domainId={params.id} />

      <Card>
        <h2 className="font-semibold text-slate-900">{zh.repo.scannerTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{zh.repo.scannerDesc}</p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
{`dotnet run --project ArchDoc.Cli -- ^
  --solution .\\YourSolution.sln ^
  --repository-id <仓库UUID> ^
  --api-url http://localhost:3000/api/v1 ^
  --api-key dev-secret-key`}
        </pre>
      </Card>
    </div>
  );
}
