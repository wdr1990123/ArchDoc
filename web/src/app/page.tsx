import Link from "next/link";
import { listDomains } from "@/lib/db/queries";
import { Card, Badge, PageHeader, EmptyState, Button } from "@/components/ui";
import { CreateDomainForm } from "./CreateDomainForm";
import { DeleteDomainButton } from "./DeleteDomainButton";
import { zh, formatDate } from "@/lib/i18n/zh";

export default async function HomePage() {
  let domains: Awaited<ReturnType<typeof listDomains>> = [];
  let dbError: string | null = null;

  try {
    domains = await listDomains();
  } catch {
    dbError = zh.home.dbError;
  }

  return (
    <div className="space-y-8">
      <PageHeader title={zh.home.title} description={zh.home.desc}>
        <Link href="/quick-start">
          <Button>{zh.quickStart.pageTitle}</Button>
        </Link>
      </PageHeader>

      {dbError && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">{dbError}</Card>
      )}

      <Card className="border-blue-100 bg-blue-50/50">
        <h2 className="text-sm font-semibold text-slate-900">{zh.home.createPathTitle}</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
          <li>{zh.home.createPathQuick}</li>
          <li>{zh.home.createPathAdvanced}</li>
        </ul>
      </Card>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-500">
          {zh.home.existingList}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {domains.map((d) => (
            <Card key={d.id} className="transition hover:border-slate-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/domains/${d.id}`} className="min-w-0 flex-1">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-slate-900">{d.name}</h3>
                    <Badge>{zh.home.domainBadge}</Badge>
                  </div>
                  {d.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{d.description}</p>
                  )}
                  <p className="mt-3 text-xs text-slate-400">
                    {zh.home.createdAt} {formatDate(d.created_at)}
                  </p>
                </Link>
                <DeleteDomainButton domainId={d.id} domainName={d.name} />
              </div>
            </Card>
          ))}
          {domains.length === 0 && !dbError && (
            <div className="md:col-span-2">
              <EmptyState>
                <p>{zh.home.empty}</p>
                <Link href="/quick-start" className="mt-3 inline-block">
                  <Button>{zh.quickStart.pageTitle}</Button>
                </Link>
              </EmptyState>
            </div>
          )}
        </div>
      </section>

      <details className="group rounded-xl border border-slate-200 bg-slate-50/50 px-5 py-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-600 marker:text-slate-400 group-open:mb-4">
          {zh.home.advancedCreate}
        </summary>
        <p className="mb-4 text-xs text-slate-500">{zh.home.advancedCreateHint}</p>
        <CreateDomainForm embedded />
      </details>
    </div>
  );
}
