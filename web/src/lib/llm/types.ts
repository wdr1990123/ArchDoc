export type LlmProfileRole = "diagnosis" | "summary" | "fallback";

export interface LlmProfile {
  id: string;
  name: string;
  provider: "openai" | "azure" | "custom";
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  enabled: boolean;
  role: LlmProfileRole;
  isDefault: boolean;
}

export interface LlmSettings {
  profiles: LlmProfile[];
  defaultDiagnosisProfileId: string | null;
}
