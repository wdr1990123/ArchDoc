"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/layout/ui";
import { getStoredApiKey } from "@/lib/api/storage";
import {
  buildScanCommand,
  buildScannerCdLine,
  getDefaultApiUrl,
  getDefaultScanShell,
  getScannerDir,
  type ScanCommandShell,
} from "@/lib/scan/command";
import { zh } from "@/lib/i18n/zh";

export interface ScanCommandProps {
  solutionPath: string;
  repositoryId?: string;
  domainId?: string;
  repoName?: string;
  diagnose?: boolean;
  showAltMode?: boolean;
}

const SHELLS: { key: ScanCommandShell; label: string }[] = [
  { key: "powershell", label: zh.quickStart.shellPowerShell },
  { key: "cmd", label: zh.quickStart.shellCmd },
  { key: "oneline", label: zh.quickStart.shellOneline },
];

export function ScanCommand({
  solutionPath,
  repositoryId,
  domainId,
  repoName,
  diagnose = false,
  showAltMode = false,
}: ScanCommandProps) {
  const [copied, setCopied] = useState(false);
  const [useDomainMode, setUseDomainMode] = useState(false);
  const [shell, setShell] = useState<ScanCommandShell>(() => getDefaultScanShell());

  const command = useMemo(() => {
    const apiKey = getStoredApiKey() || "dev-secret-key";
    const base = {
      solutionPath,
      apiUrl: getDefaultApiUrl(),
      apiKey,
      diagnose,
      outputPath: "scan-result.json",
      shell,
    };

    if (useDomainMode && domainId && repoName) {
      return buildScanCommand({ ...base, domainId, repoName });
    }

    return buildScanCommand({ ...base, repositoryId });
  }, [solutionPath, repositoryId, domainId, repoName, diagnose, useDomainMode, shell]);

  const cdLine = useMemo(() => buildScannerCdLine(shell), [shell]);

  async function copyCommand() {
    const full = getScannerDir() ? `${cdLine}\n${command}` : `${cdLine}\n# cd D:\\path\\to\\ArchDoc\\scanner\n${command}`;
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{zh.repo.scannerDesc}</p>
        <Button variant="secondary" type="button" onClick={() => void copyCommand()}>
          {copied ? zh.common.copied : zh.quickStart.copyCommand}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {SHELLS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setShell(s.key)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              shell === s.key
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {showAltMode && domainId && repoName && repositoryId && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={useDomainMode}
            onChange={(e) => setUseDomainMode(e.target.checked)}
          />
          {zh.quickStart.useDomainMode}
        </label>
      )}

      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
        {cdLine}
        {!getScannerDir() && "\n# cd D:\\path\\to\\ArchDoc\\scanner"}
        {"\n"}
        {command}
      </pre>

      <p className="text-xs text-slate-500">{zh.quickStart.cliHint}</p>
      {!getScannerDir() && (
        <p className="text-xs text-amber-700">
          未配置 Scanner 目录：在 web/.env.local 添加{" "}
          <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SCANNER_DIR=D:\...\ArchDoc\scanner</code>{" "}
          后重启 npm run dev，复制命令将包含正确的 cd 路径。
        </p>
      )}
      {!solutionPath.toLowerCase().endsWith(".sln") && (
        <p className="text-xs text-amber-700">
          提示：Solution 路径应指向 .sln 文件（例如 Git.HikAgv.App.sln），不能只是目录。
        </p>
      )}
    </div>
  );
}
