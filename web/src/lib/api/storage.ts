const STORAGE_KEY = "archdoc_api_key";

export function getStoredApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setStoredApiKey(key: string): void {
  if (typeof window === "undefined") return;
  if (key.trim()) {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function resolveApiKey(override?: string): string | undefined {
  const key = override?.trim() || getStoredApiKey().trim();
  return key || undefined;
}
