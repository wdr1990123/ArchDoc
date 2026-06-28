import { query, queryOne } from "@/lib/db/client";
import { randomUUID } from "crypto";
import type { LlmProfile, LlmSettings } from "@/lib/llm/types";

export type { LlmProfile, LlmProfileRole, LlmSettings } from "@/lib/llm/types";

const SETTINGS_KEY = "llm_profiles";
const MASK = "********";

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return MASK;
  return `${key.slice(0, 4)}${MASK}${key.slice(-4)}`;
}

export function sanitizeProfileForClient(p: LlmProfile): LlmProfile {
  return { ...p, apiKey: maskApiKey(p.apiKey) };
}

function profileFromEnv(): LlmProfile | null {
  const apiKey = process.env.LLM_API_KEY ?? "";
  if (!apiKey) return null;
  return {
    id: "env-default",
    name: "环境变量默认",
    provider: "openai",
    baseUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
    apiKey,
    model: process.env.LLM_MODEL ?? "gpt-4o",
    maxTokens: Number(process.env.LLM_MAX_TOKENS ?? 16384),
    enabled: true,
    role: "diagnosis",
    isDefault: true,
  };
}

export async function getLlmSettings(): Promise<LlmSettings> {
  const row = await queryOne<{ value: LlmSettings }>(
    `SELECT value FROM app_settings WHERE key = $1`,
    [SETTINGS_KEY]
  );

  if (row?.value?.profiles?.length) {
    return row.value;
  }

  const envProfile = profileFromEnv();
  if (envProfile) {
    return {
      profiles: [envProfile],
      defaultDiagnosisProfileId: envProfile.id,
    };
  }

  return { profiles: [], defaultDiagnosisProfileId: null };
}

export async function saveLlmSettings(settings: LlmSettings): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [SETTINGS_KEY, JSON.stringify(settings)]
  );
}

export async function getLlmProfileById(profileId?: string): Promise<LlmProfile | null> {
  const settings = await getLlmSettings();
  const envProfile = profileFromEnv();

  if (profileId) {
    const found = settings.profiles.find((p) => p.id === profileId && p.enabled);
    if (found) return found;
  }

  const defaultId = settings.defaultDiagnosisProfileId;
  if (defaultId) {
    const def = settings.profiles.find((p) => p.id === defaultId && p.enabled);
    if (def) return def;
  }

  const diagnosis = settings.profiles.find(
    (p) => p.enabled && p.role === "diagnosis" && p.isDefault
  );
  if (diagnosis) return diagnosis;

  const anyDiagnosis = settings.profiles.find(
    (p) => p.enabled && p.role === "diagnosis"
  );
  if (anyDiagnosis) return anyDiagnosis;

  const anyEnabled = settings.profiles.find((p) => p.enabled);
  if (anyEnabled) return anyEnabled;

  return envProfile;
}

export function mergeProfileUpdate(
  existing: LlmProfile | undefined,
  incoming: Partial<LlmProfile> & { id?: string }
): LlmProfile {
  const id = incoming.id ?? existing?.id ?? randomUUID();
  let apiKey = incoming.apiKey ?? existing?.apiKey ?? "";
  if (apiKey.includes(MASK) && existing?.apiKey) {
    apiKey = existing.apiKey;
  }

  return {
    id,
    name: incoming.name ?? existing?.name ?? "未命名模型",
    provider: incoming.provider ?? existing?.provider ?? "openai",
    baseUrl: incoming.baseUrl ?? existing?.baseUrl ?? "https://api.openai.com/v1",
    apiKey,
    model: incoming.model ?? existing?.model ?? "gpt-4o",
    maxTokens: incoming.maxTokens ?? existing?.maxTokens ?? 16384,
    enabled: incoming.enabled ?? existing?.enabled ?? true,
    role: incoming.role ?? existing?.role ?? "diagnosis",
    isDefault: incoming.isDefault ?? existing?.isDefault ?? false,
  };
}

export async function resolveProfilesForSave(
  incoming: LlmSettings
): Promise<LlmSettings> {
  const current = await getLlmSettings();
  const currentMap = new Map(current.profiles.map((p) => [p.id, p]));

  const profiles = incoming.profiles.map((p) =>
    mergeProfileUpdate(currentMap.get(p.id), p)
  );

  let defaultId = incoming.defaultDiagnosisProfileId;
  if (!defaultId && profiles.length > 0) {
    defaultId =
      profiles.find((p) => p.isDefault && p.role === "diagnosis")?.id ??
      profiles.find((p) => p.role === "diagnosis")?.id ??
      profiles[0].id;
  }

  const normalized = profiles.map((p) => ({
    ...p,
    isDefault: p.id === defaultId,
  }));

  return { profiles: normalized, defaultDiagnosisProfileId: defaultId };
}
