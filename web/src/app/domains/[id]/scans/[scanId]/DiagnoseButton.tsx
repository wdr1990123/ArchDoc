"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { apiPost } from "@/lib/api/client";
import { zh } from "@/lib/i18n/zh";

export function DiagnoseButton({
  scanId,
  domainId,
}: {
  scanId: string;
  domainId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDiagnose() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<{ job_id: string; report_id?: string }>(
        `/api/v1/scans/${scanId}/diagnose`,
        {}
      );
      if (res.report_id) {
        router.push(`/domains/${domainId}/scans/${scanId}/reports/${res.report_id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={runDiagnose} disabled={loading}>
        {loading ? zh.scan.aiGenerating : zh.scan.aiBtn}
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
