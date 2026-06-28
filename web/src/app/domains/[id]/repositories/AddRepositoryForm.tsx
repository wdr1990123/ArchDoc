"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { apiPost } from "@/lib/api/client";
import { zh } from "@/lib/i18n/zh";

export function AddRepositoryForm({ domainId }: { domainId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [solutionPath, setSolutionPath] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiPost<{ repository: { id: string } }>(
        "/api/v1/repositories",
        {
          domain_id: domainId,
          name,
          source_type: "local",
          solution_path: solutionPath || undefined,
        }
      );
      setCreatedId(res.repository.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    }
  }

  async function copyId() {
    if (!createdId) return;
    await navigator.clipboard.writeText(createdId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <h2 className="font-semibold text-slate-900">{zh.repo.addTitle}</h2>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          placeholder={zh.repo.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          placeholder={zh.repo.solutionPlaceholder}
          value={solutionPath}
          onChange={(e) => setSolutionPath(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {createdId && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm text-emerald-900">{zh.repo.createdHint}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-white px-2 py-1 text-xs">
                {createdId}
              </code>
              <Button variant="secondary" onClick={copyId} type="button">
                {copied ? zh.common.copied : zh.common.copy}
              </Button>
            </div>
          </div>
        )}
        <Button type="submit">{zh.repo.addBtn}</Button>
      </form>
    </Card>
  );
}
