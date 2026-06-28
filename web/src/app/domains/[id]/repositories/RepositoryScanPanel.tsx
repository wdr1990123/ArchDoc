"use client";

import { ScanCommand } from "@/components/ScanCommand";
import { ScanWaitPanel } from "@/components/ScanWaitPanel";
import { UploadScanJson } from "@/components/UploadScanJson";

export function RepositoryScanPanel({
  domainId,
  repositoryId,
  solutionPath,
  repoName,
}: {
  domainId: string;
  repositoryId: string;
  solutionPath: string;
  repoName: string;
}) {
  if (!solutionPath) {
    return (
      <UploadScanJson domainId={domainId} repositoryId={repositoryId} />
    );
  }

  return (
    <div className="space-y-4">
      <ScanCommand
        solutionPath={solutionPath}
        repositoryId={repositoryId}
        domainId={domainId}
        repoName={repoName}
        showAltMode
      />
      <ScanWaitPanel domainId={domainId} repositoryId={repositoryId} />
      <UploadScanJson domainId={domainId} repositoryId={repositoryId} />
    </div>
  );
}
