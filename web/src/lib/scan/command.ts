export type ScanCommandShell = "powershell" | "cmd" | "oneline";

export interface ScanCommandOptions {
  solutionPath: string;
  repositoryId?: string;
  domainId?: string;
  repoName?: string;
  apiUrl?: string;
  apiKey?: string;
  diagnose?: boolean;
  outputPath?: string;
  /** 默认 powershell（Windows 常用）；cmd 使用 ^，powershell 使用 ` */
  shell?: ScanCommandShell;
}

export function getDefaultApiUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/v1`;
  }
  return process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000/api/v1";
}

export function getDefaultScanShell(): ScanCommandShell {
  if (typeof window === "undefined") return "powershell";
  return /win/i.test(window.navigator.userAgent) ? "powershell" : "oneline";
}

/** Scanner CLI 工作目录，来自 NEXT_PUBLIC_SCANNER_DIR（web/.env.local） */
export function getScannerDir(): string {
  return process.env.NEXT_PUBLIC_SCANNER_DIR?.trim().replace(/\//g, "\\") ?? "";
}

export function buildScannerCdLine(shell: ScanCommandShell): string {
  const dir = getScannerDir();
  if (!dir) {
    return "# 请先在 web/.env.local 配置 NEXT_PUBLIC_SCANNER_DIR（scanner 目录绝对路径）";
  }
  if (shell === "cmd") {
    return `cd /d ${dir}`;
  }
  return `cd ${dir}`;
}

function quotePath(path: string): string {
  if (/[\s"]/.test(path)) return `"${path.replace(/"/g, '\\"')}"`;
  return path;
}

function buildArgList(options: ScanCommandOptions): string[] {
  const apiUrl = options.apiUrl ?? getDefaultApiUrl();
  const args: string[] = [`--solution ${quotePath(options.solutionPath)}`];

  if (options.domainId && options.repoName) {
    args.push(`--domain-id ${options.domainId}`);
    args.push(`--repo-name ${quotePath(options.repoName)}`);
  } else if (options.repositoryId) {
    args.push(`--repository-id ${options.repositoryId}`);
  }

  args.push(`--api-url ${apiUrl}`);

  if (options.apiKey) {
    args.push(`--api-key ${options.apiKey}`);
  }

  if (options.diagnose) {
    args.push("--diagnose");
  }

  args.push(`--output ${quotePath(options.outputPath ?? "scan-result.json")}`);
  return args;
}

export function buildScanCommand(options: ScanCommandOptions): string {
  const shell = options.shell ?? "powershell";
  const args = buildArgList(options);

  if (shell === "oneline") {
    return `dotnet run --project ArchDoc.Cli -- ${args.join(" ")}`;
  }

  const cont = shell === "powershell" ? "`" : "^";
  const body = args
    .map((line, index) => (index < args.length - 1 ? `  ${line} ${cont}` : `  ${line}`))
    .join("\n");

  return `dotnet run --project ArchDoc.Cli -- ${cont}\n${body}`;
}
