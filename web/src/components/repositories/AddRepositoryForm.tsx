"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/layout/ui";
import { apiPost } from "@/lib/api/client";
import { ScanCommand } from "@/components/scans/ScanCommand";
import { ScanWaitPanel } from "@/components/scans/ScanWaitPanel";
import { UploadScanJson } from "@/components/scans/UploadScanJson";
import { zh } from "@/lib/i18n/zh";

function repoNameFromSolution(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? "";
  return base.replace(/\.sln$/i, "") || "MyRepo";
}

export function AddRepositoryForm({ domainId }: { domainId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [solutionPath, setSolutionPath] = useState("");
  const [created, setCreated] = useState<{
    id: string;
    name: string;
    solution_path: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const finalName = name.trim() || repoNameFromSolution(solutionPath);
      const res = await apiPost<{ repository: { id: string; name: string; solution_path: string | null } }>(
        "/api/v1/repositories",
        {
          domain_id: domainId,
          name: finalName,
          source_type: "local",
          solution_path: solutionPath || undefined,
        }
      );
      setCreated(res.repository);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    }
  }

  return (
    <Card>
      <h2 className="font-semibold text-slate-900">{zh.repo.addTitle}</h2>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 grid gap-3">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          placeholder={zh.repo.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-mono"
          placeholder={zh.repo.solutionPlaceholder}
          value={solutionPath}
          onChange={(e) => setSolutionPath(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit">{zh.repo.addBtn}</Button>
      </form>

      {created && created.solution_path && (
        <div className="mt-6 space-y-4 border-t border-slate-100 pt-6">
          <p className="text-sm font-medium text-emerald-800">{zh.repo.createdHint}</p>
          <ScanCommand
            solutionPath={created.solution_path}
            repositoryId={created.id}
            domainId={domainId}
            repoName={created.name}
            showAltMode
          />
          <ScanWaitPanel domainId={domainId} repositoryId={created.id} />
          <UploadScanJson domainId={domainId} repositoryId={created.id} />
        </div>
      )}
    </Card>
  );
}
