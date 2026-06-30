"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/layout/ui";
import { apiPost } from "@/lib/api/client";
import { zh } from "@/lib/i18n/zh";
import type { ScanResultPayload } from "@/lib/types";

interface UploadScanJsonProps {
  domainId: string;
  repositoryId: string;
  autoDiagnose?: boolean;
}

export function UploadScanJson({
  domainId,
  repositoryId,
  autoDiagnose = false,
}: UploadScanJsonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as ScanResultPayload;
      payload.repository_id = repositoryId;
      if (!payload.schema_version) payload.schema_version = "1.0";

      const res = await apiPost<{ scan_run_id: string }>(
        "/api/v1/scans/upload",
        payload
      );

      if (autoDiagnose) {
        const diag = await apiPost<{ report_id?: string }>(
          `/api/v1/scans/${res.scan_run_id}/diagnose`,
          {}
        );
        if (diag.report_id) {
          router.push(
            `/domains/${domainId}/scans/${res.scan_run_id}/reports/${diag.report_id}`
          );
          return;
        }
      }

      router.push(`/domains/${domainId}/scans/${res.scan_run_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : zh.quickStart.uploadFailed);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
      <p className="text-sm font-medium text-slate-900">{zh.quickStart.uploadTitle}</p>
      <p className="mt-1 text-xs text-slate-600">{zh.quickStart.uploadDesc}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="text-sm text-slate-600"
          disabled={loading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {loading && <span className="text-sm text-slate-500">{zh.common.loading}</span>}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
