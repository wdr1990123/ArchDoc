"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Badge } from "@/components/layout/ui";
import { getStoredApiKey, setStoredApiKey } from "@/lib/api/storage";

type Status = "idle" | "saved" | "verified" | "error";

export function ApiKeyConfig() {
  const [key, setKey] = useState("dev-secret-key");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const stored = getStoredApiKey();
      if (stored) {
        setKey(stored);
        setStatus("saved");
        setMessage("已从浏览器读取已保存的密钥");
      }
    } catch {
      setMessage("无法访问浏览器存储，请每次手动输入密钥");
    }
  }, []);

  const verifyKey = useCallback(async (apiKey: string) => {
    const res = await fetch("/api/v1/auth/verify", {
      headers: { "X-Api-Key": apiKey },
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? "密钥无效，请确认与 .env.local 中 ARCHDOC_API_KEY 一致");
    }
    return data.message ?? "API 密钥有效";
  }, []);

  async function save() {
    setMessage("");
    const trimmed = key.trim();
    if (!trimmed) {
      setStatus("error");
      setMessage("请输入 API 密钥");
      return;
    }

    try {
      setStoredApiKey(trimmed);
      setMessage("已写入浏览器，正在验证…");
      const msg = await verifyKey(trimmed);
      setStatus("verified");
      setMessage(msg);
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "保存或验证失败");
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-slate-900">API 访问密钥</h2>
        {status === "verified" && <Badge tone="success">已验证</Badge>}
        {status === "saved" && <Badge tone="success">已保存</Badge>}
        {status === "error" && <Badge tone="critical">无效</Badge>}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        须与服务器 <code className="rounded bg-slate-100 px-1">ARCHDOC_API_KEY</code> 一致。
        本地默认值为 <code className="rounded bg-slate-100 px-1">dev-secret-key</code>。
      </p>

      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        <input
          className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          placeholder="dev-secret-key"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setStatus("idle");
            setMessage("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
        <Button type="button" onClick={() => void save()}>
          保存并验证
        </Button>
      </div>

      {message && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            status === "error"
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {message}
        </p>
      )}
    </Card>
  );
}
