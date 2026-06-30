"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import { ReportView } from "@/components/reports/ReportView";
import { Button } from "@/components/layout/ui";
import { zh } from "@/lib/i18n/zh";
import type { AiReportContent, EvidenceCatalogEntry } from "@/lib/types";

export function ReportContentTabs({
  content,
  catalog,
  markdown,
  reportType,
  downloadFilename,
}: {
  content: AiReportContent;
  catalog: Map<string, EvidenceCatalogEntry>;
  markdown: string | null;
  reportType: string;
  downloadFilename: string;
}) {
  const [tab, setTab] = useState<"structured" | "markdown">("structured");

  function downloadMarkdown() {
    const body = markdown ?? "";
    const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("structured")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "structured"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {zh.scan.structuredView}
          </button>
          <button
            type="button"
            onClick={() => setTab("markdown")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "markdown"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {zh.scan.markdownView}
          </button>
        </div>
        {markdown && (
          <Button onClick={downloadMarkdown}>
            {zh.scan.downloadMarkdown}
          </Button>
        )}
      </div>

      {tab === "structured" ? (
        <ReportView content={content} catalog={catalog} reportType={reportType} />
      ) : (
        <div className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700">
          {markdown ? (
            <Markdown>{markdown}</Markdown>
          ) : (
            <p className="text-sm text-slate-500">{zh.scan.markdownMissing}</p>
          )}
        </div>
      )}
    </div>
  );
}
