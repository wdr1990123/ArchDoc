"use client";

import { ScanCommand } from "@/components/scans/ScanCommand";
import { ScanWaitPanel } from "@/components/scans/ScanWaitPanel";
import { UploadScanJson } from "@/components/scans/UploadScanJson";

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
