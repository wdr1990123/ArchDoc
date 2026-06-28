import Link from "next/link";
import { listDomains } from "@/lib/db/queries";
import { Card, Badge, PageHeader, EmptyState } from "@/components/ui";
import { CreateDomainForm } from "./CreateDomainForm";
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
      <PageHeader title={zh.home.title} description={zh.home.desc} />

      {dbError && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">{dbError}</Card>
      )}

      <CreateDomainForm />

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-500">
          已有诊断域
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {domains.map((d) => (
            <Link key={d.id} href={`/domains/${d.id}`}>
              <Card className="transition hover:border-slate-300 hover:shadow-md">
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
              </Card>
            </Link>
          ))}
          {domains.length === 0 && !dbError && <EmptyState>{zh.home.empty}</EmptyState>}
        </div>
      </section>
    </div>
  );
}
