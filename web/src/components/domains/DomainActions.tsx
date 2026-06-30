"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/layout/ui";
import { apiPost } from "@/lib/api/client";
import { zh } from "@/lib/i18n/zh";

interface ScanRunRow {
  id: string;
  repository_name: string;
  status: string;
}

export function DomainActions({
  domainId,
  scanRuns,
}: {
  domainId: string;
  scanRuns: ScanRunRow[];
}) {
  const router = useRouter();
  const [snapshotName, setSnapshotName] = useState("跨仓库快照");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const completed = scanRuns.filter((s) => s.status === "completed");

  async function createSnapshot() {
    if (selected.length < 2) {
      setMessage(zh.domain.selectScans);
      return;
    }
    try {
      await apiPost(`/api/v1/domains/${domainId}/snapshot`, {
        name: snapshotName,
        scan_run_ids: selected,
      });
      setMessage(zh.domain.snapshotOk);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "创建失败");
    }
  }

  return (
    <Card>
      <h3 className="font-semibold text-slate-900">{zh.domain.snapshotTitle}</h3>
      <p className="mt-1 text-sm text-slate-600">{zh.domain.snapshotDesc}</p>
      <input
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        value={snapshotName}
        onChange={(e) => setSnapshotName(e.target.value)}
        placeholder={zh.domain.snapshotName}
      />
      <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
        {completed.length === 0 && (
          <p className="text-sm text-slate-500">暂无已完成的扫描</p>
        )}
        {completed.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="rounded"
              checked={selected.includes(s.id)}
              onChange={(e) => {
                setSelected((prev) =>
                  e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                );
              }}
            />
            <span>{s.repository_name}</span>
            <span className="font-mono text-xs text-slate-400">{s.id.slice(0, 8)}…</span>
          </label>
        ))}
      </div>
      {message && (
        <p className={`mt-2 text-sm ${message.includes("已") ? "text-green-700" : "text-red-600"}`}>
          {message}
        </p>
      )}
      <Button className="mt-3" onClick={createSnapshot}>
        {zh.domain.snapshotBtn}
      </Button>
    </Card>
  );
}
