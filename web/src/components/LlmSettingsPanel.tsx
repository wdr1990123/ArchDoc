"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Badge } from "@/components/ui";
import { zh } from "@/lib/i18n/zh";
import type { LlmProfile, LlmProfileRole, LlmSettings } from "@/lib/llm/types";
import { apiPut, apiPost } from "@/lib/api/client";

const PRESETS = [
  { name: "OpenAI GPT-4o", baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  {
    name: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
  { name: "私有 Qwen", baseUrl: "http://localhost:8000/v1", model: "qwen2.5-72b-instruct" },
];

function newProfileId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `prof-${Date.now()}`;
}

function emptyProfile(preset?: (typeof PRESETS)[0]): LlmProfile {
  const p: LlmProfile = {
    id: newProfileId(),
    name: preset?.name ?? "新模型配置",
    provider: "openai",
    baseUrl: preset?.baseUrl ?? "https://api.openai.com/v1",
    apiKey: "",
    model: preset?.model ?? "gpt-4o",
    maxTokens: 16384,
    enabled: true,
    role: "diagnosis",
    isDefault: false,
  };
  return p;
}

function normalizeSettings(raw: LlmSettings): LlmSettings {
  const profiles = Array.isArray(raw.profiles) ? raw.profiles : [];
  return {
    profiles,
    defaultDiagnosisProfileId: raw.defaultDiagnosisProfileId ?? null,
  };
}

interface Props {
  initialSettings: LlmSettings;
  initialEnvConfigured: boolean;
  initialLoadError?: string | null;
}

export function LlmSettingsPanel({
  initialSettings,
  initialEnvConfigured,
  initialLoadError = null,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<LlmSettings>(() => normalizeSettings(initialSettings));
  const [envConfigured] = useState(initialEnvConfigured);
  const [loadError] = useState(initialLoadError);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateProfile = useCallback((id: string, patch: Partial<LlmProfile>) => {
    setSettings((prev) => ({
      ...prev,
      profiles: (prev.profiles ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  const addProfile = useCallback((preset?: (typeof PRESETS)[0]) => {
    const p = emptyProfile(preset);
    setSettings((prev) => {
      const existing = prev.profiles ?? [];
      const isFirst = existing.length === 0;
      return {
        ...prev,
        profiles: [...existing, p],
        defaultDiagnosisProfileId: isFirst ? p.id : prev.defaultDiagnosisProfileId,
      };
    });
    setMessage({ type: "ok", text: `已添加「${p.name}」，请填写 API Key 后保存` });
    requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const removeProfile = useCallback((id: string) => {
    setSettings((prev) => ({
      profiles: (prev.profiles ?? []).filter((p) => p.id !== id),
      defaultDiagnosisProfileId:
        prev.defaultDiagnosisProfileId === id ? null : prev.defaultDiagnosisProfileId,
    }));
  }, []);

  const setDefault = useCallback((id: string) => {
    setSettings((prev) => ({
      ...prev,
      defaultDiagnosisProfileId: id,
      profiles: (prev.profiles ?? []).map((p) => ({
        ...p,
        isDefault: p.id === id,
      })),
    }));
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await apiPut("/api/v1/settings/llm", { settings });
      setMessage({ type: "ok", text: zh.settings.saved });
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : zh.settings.saveFailed,
      });
    } finally {
      setSaving(false);
    }
  }

  async function testProfile(profile: LlmProfile) {
    setTestResults((prev) => ({ ...prev, [profile.id]: "测试中…" }));
    try {
      const res = await apiPost<{ ok: boolean; message?: string }>(
        "/api/v1/settings/llm/test",
        { profile }
      );
      setTestResults((prev) => ({
        ...prev,
        [profile.id]: res.ok ? "连接成功" : (res.message ?? "测试失败"),
      }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [profile.id]: e instanceof Error ? e.message : "测试失败",
      }));
    }
  }

  const profiles = settings.profiles ?? [];

  return (
    <div className="space-y-6">
      {loadError && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">{loadError}</Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">{zh.settings.llmTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{zh.settings.llmDesc}</p>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p className="font-medium">部署阶段说明</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-slate-600">
            <li>
              <strong>当前（公网测试）：</strong>配置 1 个公网模型，推荐 DeepSeek 或 GPT-4o
            </li>
            <li>
              <strong>未来（全内网）：</strong>改为内网 Qwen 地址，设为默认即可
            </li>
          </ul>
        </div>

        {envConfigured && profiles.length === 0 && (
          <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            {zh.settings.envFallbackDesc}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="self-center text-xs text-slate-500">快速添加：</span>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              disabled={!mounted}
              onClick={() => addProfile(p)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs hover:bg-white disabled:opacity-50"
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            disabled={!mounted}
            onClick={() => addProfile()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {zh.settings.addProfile}
          </button>
        </div>

        {!mounted && (
          <p className="mt-2 text-xs text-slate-400">正在初始化交互组件…</p>
        )}
      </Card>

      {profiles.length === 0 && (
        <Card className="text-sm text-slate-500">
          {zh.settings.noProfiles}
          <span className="mt-2 block text-slate-400">
            点击上方「DeepSeek」或「添加模型」即可开始配置
          </span>
        </Card>
      )}

      <div ref={listRef} className="space-y-4">
        {profiles.map((profile) => (
          <Card key={profile.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  className="rounded border border-slate-300 px-2 py-1 text-sm font-medium"
                  value={profile.name}
                  onChange={(e) => updateProfile(profile.id, { name: e.target.value })}
                />
                {profile.isDefault && <Badge tone="success">{zh.settings.default}</Badge>}
                {!profile.enabled && <Badge>已禁用</Badge>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void testProfile(profile)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {zh.common.test}
                </button>
                <button
                  type="button"
                  onClick={() => setDefault(profile.id)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {zh.settings.setDefault}
                </button>
                <button
                  type="button"
                  onClick={() => removeProfile(profile.id)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  {zh.common.delete}
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">{zh.settings.profileRole}</span>
                <select
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  value={profile.role}
                  onChange={(e) =>
                    updateProfile(profile.id, { role: e.target.value as LlmProfileRole })
                  }
                >
                  {Object.entries(zh.settings.roles).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">{zh.settings.model}</span>
                <input
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  value={profile.model}
                  onChange={(e) => updateProfile(profile.id, { model: e.target.value })}
                />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-slate-600">{zh.settings.baseUrl}</span>
                <input
                  className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                  value={profile.baseUrl}
                  onChange={(e) => updateProfile(profile.id, { baseUrl: e.target.value })}
                />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-slate-600">{zh.common.apiKey}</span>
                <input
                  type="password"
                  className="w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                  placeholder={zh.common.apiKeyPlaceholder}
                  value={profile.apiKey.includes("*") ? "" : profile.apiKey}
                  onChange={(e) => updateProfile(profile.id, { apiKey: e.target.value })}
                />
                {profile.apiKey.includes("*") && (
                  <span className="mt-1 block text-xs text-slate-400">当前：{profile.apiKey}</span>
                )}
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">{zh.settings.maxTokens}</span>
                <input
                  type="number"
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  value={profile.maxTokens}
                  onChange={(e) =>
                    updateProfile(profile.id, { maxTokens: Number(e.target.value) })
                  }
                />
              </label>
              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={profile.enabled}
                  onChange={(e) => updateProfile(profile.id, { enabled: e.target.checked })}
                />
                {zh.settings.enabled}
              </label>
            </div>

            {testResults[profile.id] && (
              <p
                className={`text-xs ${
                  testResults[profile.id].includes("成功") ? "text-green-700" : "text-red-600"
                }`}
              >
                {testResults[profile.id]}
              </p>
            )}
          </Card>
        ))}
      </div>

      {message && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            message.type === "ok" ? "bg-emerald-50 text-green-700" : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}

      {profiles.length > 0 && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !mounted}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
        >
          {saving ? zh.common.saving : zh.common.save}
        </button>
      )}
    </div>
  );
}
