"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { apiGet, apiPost } from "@/lib/api/client";
import { zh } from "@/lib/i18n/zh";

interface ScanWaitPanelProps {
  domainId: string;
  repositoryId: string;
  autoDiagnose?: boolean;
  onScanFound?: (scanId: string) => void;
}

export function ScanWaitPanel({
  domainId,
  repositoryId,
  autoDiagnose = false,
  onScanFound,
}: ScanWaitPanelProps) {
  const router = useRouter();
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sinceRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setWaiting(false);
  }, []);

  const handleScan = useCallback(
    async (scanId: string) => {
      stopPolling();
      setMessage(zh.quickStart.scanDetected);

      if (autoDiagnose) {
        setMessage(zh.quickStart.diagnosing);
        try {
          const res = await apiPost<{ report_id?: string }>(
            `/api/v1/scans/${scanId}/diagnose`,
            {}
          );
          if (res.report_id) {
            router.push(
              `/domains/${domainId}/scans/${scanId}/reports/${res.report_id}`
            );
            return;
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : zh.quickStart.diagnoseFailed);
        }
      }

      onScanFound?.(scanId);
      router.push(`/domains/${domainId}/scans/${scanId}`);
    },
    [autoDiagnose, domainId, onScanFound, router, stopPolling]
  );

  const poll = useCallback(async () => {
    attemptsRef.current += 1;
    if (attemptsRef.current > 40) {
      stopPolling();
      setError(zh.quickStart.waitTimeout);
      return;
    }

    try {
      const since = sinceRef.current ? `?since=${encodeURIComponent(sinceRef.current)}` : "";
      const res = await apiGet<{ scan: { id: string } | null }>(
        `/api/v1/repositories/${repositoryId}/scans/latest${since}`
      );
      if (res.scan?.id) {
        await handleScan(res.scan.id);
      }
    } catch {
      /* keep polling */
    }
  }, [handleScan, repositoryId, stopPolling]);

  function startWaiting() {
    setError(null);
    setMessage(zh.quickStart.waitingScan);
    sinceRef.current = new Date().toISOString();
    attemptsRef.current = 0;
    setWaiting(true);
    void poll();
    timerRef.current = setInterval(() => void poll(), 3000);
  }

  useEffect(() => () => stopPolling(), [stopPolling]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-900">{zh.quickStart.waitTitle}</p>
      <p className="mt-1 text-xs text-slate-600">{zh.quickStart.waitDesc}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={startWaiting} disabled={waiting}>
          {waiting ? zh.quickStart.waiting : zh.quickStart.startWait}
        </Button>
        {waiting && (
          <Button type="button" variant="secondary" onClick={stopPolling}>
            {zh.common.cancel}
          </Button>
        )}
      </div>

      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
