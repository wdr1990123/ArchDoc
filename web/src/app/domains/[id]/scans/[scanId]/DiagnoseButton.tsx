"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { apiGet, apiPost } from "@/lib/api/client";
import { zh } from "@/lib/i18n/zh";

async function waitForDiagnoseJob(jobId: string, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { job } = await apiGet<{
      job: {
        status: string;
        error_message: string | null;
        result?: { report_id?: string };
      };
    }>(`/api/v1/jobs/${jobId}`);
    if (job.status === "completed") return job.result?.report_id;
    if (job.status === "failed") {
      throw new Error(job.error_message ?? zh.quickStart.diagnoseFailed);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("诊断超时，请稍后刷新页面查看是否已生成报告");
}

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
      const reportId = res.report_id ?? (await waitForDiagnoseJob(res.job_id));
      if (reportId) {
        router.push(`/domains/${domainId}/scans/${scanId}/reports/${reportId}`);
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
