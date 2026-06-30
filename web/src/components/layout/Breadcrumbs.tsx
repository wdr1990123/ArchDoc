import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="面包屑" className="text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && (
                <span className="text-slate-300 select-none" aria-hidden>
                  ›
                </span>
              )}
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-slate-800 hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? "font-medium text-slate-800" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
