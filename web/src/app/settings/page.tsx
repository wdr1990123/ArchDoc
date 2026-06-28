import dynamic from "next/dynamic";
import { PageHeader, Card } from "@/components/ui";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ApiKeyConfig } from "@/components/ApiKeyConfig";
import { zh } from "@/lib/i18n/zh";
import { homeCrumb } from "@/lib/nav/breadcrumbs";
import { checkDbConnection } from "@/lib/db/client";
import { getLlmSettings, sanitizeProfileForClient } from "@/lib/llm/config";

const LlmSettingsPanel = dynamic(
  () => import("@/components/LlmSettingsPanel").then((m) => m.LlmSettingsPanel),
  {
    ssr: false,
    loading: () => (
      <Card className="text-sm text-slate-500">正在加载模型配置面板…</Card>
    ),
  }
);

export default async function SettingsPage() {
  const dbOk = await checkDbConnection().catch(() => false);

  let llmSettings = { profiles: [] as ReturnType<typeof sanitizeProfileForClient>[], defaultDiagnosisProfileId: null as string | null };
  let llmLoadError: string | null = null;

  try {
    const raw = await getLlmSettings();
    llmSettings = {
      ...raw,
      profiles: raw.profiles.map(sanitizeProfileForClient),
    };
  } catch (e) {
    llmLoadError = e instanceof Error ? e.message : "无法读取模型配置";
  }

  return (
    <div className="space-y-8">
      <Breadcrumbs items={[homeCrumb(), { label: zh.breadcrumb.settings }]} />
      <PageHeader title={zh.settings.title} description="数据库连接、API 密钥与大模型配置" />

      <ApiKeyConfig />

      <Card>
        <h2 className="font-semibold text-slate-900">{zh.settings.healthTitle}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <dt className="text-xs text-slate-500">服务状态</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {dbOk ? zh.settings.healthOk : zh.settings.healthDegraded}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <dt className="text-xs text-slate-500">数据库</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {dbOk ? zh.settings.dbConnected : zh.settings.dbDisconnected}
            </dd>
          </div>
        </dl>
      </Card>

      <LlmSettingsPanel
        initialSettings={llmSettings}
        initialEnvConfigured={Boolean(process.env.LLM_API_KEY)}
        initialLoadError={llmLoadError}
      />
    </div>
  );
}
