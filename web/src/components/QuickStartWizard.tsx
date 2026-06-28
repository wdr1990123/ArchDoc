"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { apiPost } from "@/lib/api/client";
import { ScanCommand } from "@/components/ScanCommand";
import { ScanWaitPanel } from "@/components/ScanWaitPanel";
import { UploadScanJson } from "@/components/UploadScanJson";
import { zh } from "@/lib/i18n/zh";

function repoNameFromSolution(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? "";
  return base.replace(/\.sln$/i, "") || "MyRepo";
}

export function QuickStartWizard() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "scan">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [solutionPath, setSolutionPath] = useState("");
  const [repoName, setRepoName] = useState("");
  const [autoDiagnose, setAutoDiagnose] = useState(true);

  const [domainId, setDomainId] = useState("");
  const [repositoryId, setRepositoryId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const finalRepoName = repoName.trim() || repoNameFromSolution(solutionPath);

    try {
      const res = await apiPost<{
        domain: { id: string };
        repository: { id: string };
      }>("/api/v1/domains/quick-start", {
        name: name.trim(),
        description: description.trim() || undefined,
        repo_name: finalRepoName,
        solution_path: solutionPath.trim(),
      });

      setDomainId(res.domain.id);
      setRepositoryId(res.repository.id);
      setRepoName(finalRepoName);
      setStep("scan");
    } catch (err) {
      const msg = err instanceof Error ? err.message : zh.quickStart.failed;
      setError(msg.includes("already exists") ? zh.home.duplicateName : msg);
    } finally {
      setLoading(false);
    }
  }

  if (step === "scan" && domainId && repositoryId) {
    return (
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">{zh.quickStart.step2Title}</h2>
              <p className="mt-1 text-sm text-slate-600">{zh.quickStart.step2Desc}</p>
            </div>
            <Link
              href={`/domains/${domainId}`}
              className="text-sm text-blue-600 hover:underline"
            >
              {zh.quickStart.openDomain}
            </Link>
          </div>

          <div className="mt-6">
            <ScanCommand
              solutionPath={solutionPath}
              repositoryId={repositoryId}
              domainId={domainId}
              repoName={repoName}
              diagnose={autoDiagnose}
              showAltMode
            />
          </div>
        </Card>

        <ScanWaitPanel
          domainId={domainId}
          repositoryId={repositoryId}
          autoDiagnose={autoDiagnose}
        />

        <UploadScanJson
          domainId={domainId}
          repositoryId={repositoryId}
          autoDiagnose={autoDiagnose}
        />

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push(`/domains/${domainId}`)}>
            {zh.quickStart.skipToDomain}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <h2 className="font-semibold text-slate-900">{zh.quickStart.title}</h2>
      <p className="mt-1 text-sm text-slate-600">{zh.quickStart.desc}</p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 grid gap-4">
        <div>
          <label className="text-xs font-medium text-slate-600">{zh.quickStart.domainName}</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            placeholder={zh.home.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">{zh.home.descPlaceholder}</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            placeholder={zh.home.descPlaceholder}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">{zh.quickStart.solutionPath}</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-mono"
            placeholder="D:\Code\MES\MES.sln"
            value={solutionPath}
            onChange={(e) => {
              setSolutionPath(e.target.value);
              if (!repoName) setRepoName(repoNameFromSolution(e.target.value));
            }}
            required
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">{zh.quickStart.repoName}</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            placeholder={zh.repo.namePlaceholder}
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={autoDiagnose}
            onChange={(e) => setAutoDiagnose(e.target.checked)}
          />
          {zh.quickStart.autoDiagnose}
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={loading}>
          {loading ? zh.quickStart.creating : zh.quickStart.submit}
        </Button>
      </form>
    </Card>
  );
}
