import Link from "next/link";
import { Card } from "@/components/ui";
import { zh } from "@/lib/i18n/zh";

export interface DomainProgress {
  hasRepository: boolean;
  hasScan: boolean;
  hasDiagnosis: boolean;
  latestScanId: string | null;
  domainId: string;
}

function stepState(done: boolean, active: boolean): "done" | "active" | "pending" {
  if (done) return "done";
  if (active) return "active";
  return "pending";
}

export function DomainProgressBar({ progress }: { progress: DomainProgress }) {
  const steps = [
    {
      key: "created",
      label: zh.progress.created,
      state: "done" as const,
    },
    {
      key: "repo",
      label: zh.progress.repository,
      state: stepState(progress.hasRepository, !progress.hasRepository),
    },
    {
      key: "scan",
      label: zh.progress.scan,
      state: stepState(
        progress.hasScan,
        progress.hasRepository && !progress.hasScan
      ),
    },
    {
      key: "diagnosis",
      label: zh.progress.diagnosis,
      state: stepState(
        progress.hasDiagnosis,
        progress.hasScan && !progress.hasDiagnosis
      ),
    },
  ];

  const nextAction = !progress.hasRepository
    ? { href: `/domains/${progress.domainId}/repositories#add`, label: zh.progress.actionRepo }
    : !progress.hasScan
      ? { href: `/domains/${progress.domainId}/repositories#scan`, label: zh.progress.actionScan }
      : !progress.hasDiagnosis && progress.latestScanId
        ? {
            href: `/domains/${progress.domainId}/scans/${progress.latestScanId}`,
            label: zh.progress.actionDiagnose,
          }
        : progress.latestScanId
          ? {
              href: `/domains/${progress.domainId}/scans/${progress.latestScanId}`,
              label: zh.progress.actionView,
            }
          : null;

  return (
    <Card className="border-slate-200 bg-gradient-to-r from-slate-50 to-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-900">{zh.progress.title}</p>
          <ol className="mt-4 flex flex-wrap gap-2 sm:gap-0">
            {steps.map((step, index) => (
              <li key={step.key} className="flex items-center">
                <span
                  className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                    step.state === "done"
                      ? "bg-emerald-100 text-emerald-800"
                      : step.state === "active"
                        ? "bg-blue-100 text-blue-800 ring-2 ring-blue-200"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <span aria-hidden>{step.state === "done" ? "✓" : index + 1}</span>
                  {step.label}
                </span>
                {index < steps.length - 1 && (
                  <span className="mx-1 hidden text-slate-300 sm:inline">→</span>
                )}
              </li>
            ))}
          </ol>
        </div>

        {nextAction && (
          <Link
            href={nextAction.href}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {nextAction.label}
          </Link>
        )}
      </div>
    </Card>
  );
}
