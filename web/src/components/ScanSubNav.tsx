import Link from "next/link";
import { zh } from "@/lib/i18n/zh";

export type ScanTab = "overview" | "graph" | "issues";

const TABS: { key: ScanTab; label: string; segment: string }[] = [
  { key: "overview", label: zh.scan.overview, segment: "" },
  { key: "graph", label: zh.scan.graph, segment: "/graph" },
  { key: "issues", label: zh.scan.issues, segment: "/issues" },
];

export function ScanSubNav({
  domainId,
  scanId,
  active,
}: {
  domainId: string;
  scanId: string;
  active: ScanTab;
}) {
  const base = `/domains/${domainId}/scans/${scanId}`;

  return (
    <nav
      aria-label="扫描子页面"
      className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50/80 p-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`${base}${tab.segment}`}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
