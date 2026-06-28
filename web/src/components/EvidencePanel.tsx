"use client";

import Link from "next/link";
import type { EvidenceCatalogEntry, EvidenceItem } from "@/lib/types";

function EvidenceChip({ item }: { item: EvidenceCatalogEntry }) {
  const isInference = item.kind === "inference";
  const conf =
    item.confidence === "high"
      ? "高"
      : item.confidence === "medium"
        ? "中"
        : item.confidence === "low"
          ? "低"
          : null;

  const inner = (
    <span
      className={`inline-flex max-w-full flex-col rounded-md border px-2 py-1 text-left text-xs ${
        isInference
          ? "border-dashed border-violet-300 bg-violet-50 text-violet-900"
          : "border-slate-200 bg-slate-50 text-slate-800"
      }`}
      title={item.detail ?? item.ref}
    >
      <span className="font-medium">{item.label}</span>
      <span className="mt-0.5 text-[10px] opacity-70">
        {isInference ? "推断" : "事实"}
        {conf ? ` · 置信度 ${conf}` : ""}
      </span>
    </span>
  );

  if (item.link) {
    return (
      <Link href={item.link} className="hover:opacity-90">
        {inner}
      </Link>
    );
  }

  return inner;
}

export function EvidencePanel({
  items,
  title = "证据",
}: {
  items: EvidenceItem[] | EvidenceCatalogEntry[];
  title?: string;
}) {
  if (!items.length) return null;

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <EvidenceChip key={item.ref} item={item as EvidenceCatalogEntry} />
        ))}
      </div>
    </div>
  );
}

export function ReportEvidenceSidebar({
  catalogEntries,
}: {
  catalogEntries: EvidenceCatalogEntry[];
}) {
  if (!catalogEntries.length) return null;

  const facts = catalogEntries.filter((e) => e.kind !== "inference");
  const inferences = catalogEntries.filter((e) => e.kind === "inference");

  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">证据索引</h2>
      <p className="mt-1 text-xs text-slate-500">点击跳转到依赖图、Issue 或架构结构页</p>
      {facts.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-slate-600">事实 ({facts.length})</p>
          <div className="mt-2 flex flex-col gap-2">
            {facts.slice(0, 24).map((item) => (
              <EvidenceChip key={item.ref} item={item} />
            ))}
          </div>
        </div>
      )}
      {inferences.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-violet-700">推断 ({inferences.length})</p>
          <div className="mt-2 flex flex-col gap-2">
            {inferences.slice(0, 12).map((item) => (
              <EvidenceChip key={item.ref} item={item} />
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
