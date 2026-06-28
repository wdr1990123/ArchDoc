"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { apiDelete } from "@/lib/api/client";
import { zh } from "@/lib/i18n/zh";

export function DeleteDomainButton({
  domainId,
  domainName,
  redirectTo = "/",
  className = "",
}: {
  domainId: string;
  domainName: string;
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm(
      zh.home.deleteConfirm.replace("{name}", domainName)
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      await apiDelete(`/api/v1/domains/${domainId}`);
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "删除失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="danger"
      onClick={handleDelete}
      disabled={loading}
      className={className}
    >
      {loading ? zh.home.deleting : zh.home.deleteBtn}
    </Button>
  );
}
