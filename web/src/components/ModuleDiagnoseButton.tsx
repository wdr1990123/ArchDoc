"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runDiagnoseAndWait } from "@/lib/jobs/waitForDiagnose";
import { zh } from "@/lib/i18n/zh";

export function ModuleDiagnoseButton({
  scanId,
  domainId,
  moduleId,
  moduleName,
}: {
  scanId: string;
  domainId: string;
  moduleId: string;
  moduleName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const { reportId } = await runDiagnoseAndWait(scanId, {
        report_type: "module",
        module_id: moduleId,
        module_name: moduleName,
      });
      if (reportId) {
        router.push(`/domains/${domainId}/scans/${scanId}/reports/${reportId}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={loading}
      className="text-xs text-violet-700 hover:underline disabled:opacity-50"
    >
      {loading ? "生成中…" : zh.scan.moduleDiagnose}
    </button>
  );
}
