"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { apiGet } from "@/lib/api/client";
import { runDiagnoseAndWait } from "@/lib/jobs/waitForDiagnose";
import { zh } from "@/lib/i18n/zh";

/** Accept scans uploaded up to this long before user clicks "wait". */
const SCAN_LOOKBACK_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;
/** Large .NET Framework solutions can take several minutes to scan and upload. */
const MAX_POLL_ATTEMPTS = 200;

interface ScanWaitPanelProps {
  domainId: string;
  repositoryId: string;
  autoDiagnose?: boolean;
  onScanFound?: (scanId: string) => void;
}

function lookbackSince(): string {
  return new Date(Date.now() - SCAN_LOOKBACK_MS).toISOString();
}

function sinceQuery(since: string | null): string {
  return since ? `?since=${encodeURIComponent(since)}` : "";
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
  const [existingScanId, setExistingScanId] = useState<string | null>(null);
  const [pollTick, setPollTick] = useState(0);
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
      setExistingScanId(null);
      setMessage(zh.quickStart.scanDetected);

      if (autoDiagnose) {
        setMessage(zh.quickStart.diagnosing);
        try {
          const { reportId } = await runDiagnoseAndWait(scanId);
          if (reportId) {
            router.push(
              `/domains/${domainId}/scans/${scanId}/reports/${reportId}`
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
    setPollTick(attemptsRef.current);

    if (attemptsRef.current > MAX_POLL_ATTEMPTS) {
      stopPolling();
      setError(zh.quickStart.waitTimeout);
      return;
    }

    try {
      const res = await apiGet<{ scan: { id: string } | null }>(
        `/api/v1/repositories/${repositoryId}/scans/latest${sinceQuery(sinceRef.current)}`
      );
      if (res.scan?.id) {
        await handleScan(res.scan.id);
      }
    } catch {
      /* keep polling */
    }
  }, [handleScan, repositoryId, stopPolling]);

  const probeRecentScan = useCallback(async () => {
    try {
      const res = await apiGet<{ scan: { id: string } | null }>(
        `/api/v1/repositories/${repositoryId}/scans/latest${sinceQuery(lookbackSince())}`
      );
      setExistingScanId(res.scan?.id ?? null);
    } catch {
      setExistingScanId(null);
    }
  }, [repositoryId]);

  function startWaiting() {
    setError(null);
    setMessage(zh.quickStart.waitingScan);
    sinceRef.current = lookbackSince();
    attemptsRef.current = 0;
    setPollTick(0);
    setWaiting(true);
    void poll();
    timerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
  }

  useEffect(() => {
    void probeRecentScan();
  }, [probeRecentScan]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const waitedSeconds = Math.floor((pollTick * POLL_INTERVAL_MS) / 1000);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-900">{zh.quickStart.waitTitle}</p>
      <p className="mt-1 text-xs text-slate-600">{zh.quickStart.waitDesc}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={startWaiting} disabled={waiting}>
          {waiting ? zh.quickStart.waiting : zh.quickStart.startWait}
        </Button>
        {existingScanId && !waiting && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleScan(existingScanId)}
          >
            {zh.quickStart.openRecentScan}
          </Button>
        )}
        {waiting && (
          <Button type="button" variant="secondary" onClick={stopPolling}>
            {zh.common.cancel}
          </Button>
        )}
      </div>

      {waiting && pollTick > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {zh.quickStart.waitProgress(waitedSeconds)}
        </p>
      )}

      {existingScanId && !waiting && !error && (
        <p className="mt-2 text-xs text-emerald-700">{zh.quickStart.scanAlreadyFound}</p>
      )}

      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
      {error && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-red-600">{error}</p>
          {existingScanId && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleScan(existingScanId)}
            >
              {zh.quickStart.openRecentScan}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
