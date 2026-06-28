"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import { apiPost } from "@/lib/api/client";
import { zh } from "@/lib/i18n/zh";

export function CreateDomainForm({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<{ domain: { id: string } }>(
        "/api/v1/domains",
        { name, description: description || undefined }
      );
      router.push(`/domains/${res.domain.id}`);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "创建失败";
      setError(
        msg.includes("already exists") ? zh.home.duplicateName : msg
      );
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <form
      onSubmit={handleSubmit}
      className={`grid gap-3 md:grid-cols-2 ${embedded ? "" : "mt-4"}`}
    >
      <input
        className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        placeholder={zh.home.namePlaceholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        placeholder={zh.home.descPlaceholder}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}
      <Button type="submit" disabled={loading}>
        {loading ? zh.home.creating : zh.home.createBtn}
      </Button>
    </form>
  );

  if (embedded) {
    return form;
  }

  return (
    <Card>
      <h2 className="font-semibold text-slate-900">{zh.home.createTitle}</h2>
      {form}
    </Card>
  );
}
