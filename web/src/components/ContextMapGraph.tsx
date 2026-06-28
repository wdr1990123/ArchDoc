"use client";

import { useMemo } from "react";
import { DependencyGraph } from "@/components/DependencyGraph";
import type { DddGovernance } from "@/lib/types";
import { zh } from "@/lib/i18n/zh";

const RELATIONSHIP_ZH: Record<string, string> = {
  partnership: "合作",
  shared_kernel: "共享内核",
  customer_supplier: "客户-供应商",
  conformist: "遵奉者",
  anticorruption_layer: "防腐层",
  open_host_service: "开放主机",
  published_language: "发布语言",
};

const CONTEXT_COLORS: Record<string, string> = {
  core: "#7c3aed",
  supporting: "#2563eb",
  generic: "#64748b",
};

export function ContextMapGraph({
  ddd,
  height = 360,
}: {
  ddd: DddGovernance;
  height?: number;
}) {
  const { nodes, edges } = useMemo(() => {
    const contextNames = new Set<string>();
    for (const bc of ddd.bounded_contexts ?? []) contextNames.add(bc.name);
    for (const cm of ddd.context_map ?? []) {
      contextNames.add(cm.upstream_context);
      contextNames.add(cm.downstream_context);
    }

    const subdomainByContext = new Map<string, string>();
    for (const bc of ddd.bounded_contexts ?? []) {
      const sub = ddd.subdomain_landscape?.find((s) =>
        s.related_modules.some((m) => bc.modules.includes(m))
      );
      if (sub) subdomainByContext.set(bc.name, sub.classification);
    }

    const nodes = Array.from(contextNames).map((name) => {
      const bc = ddd.bounded_contexts?.find((c) => c.name === name);
      const classification = subdomainByContext.get(name) ?? "supporting";
      return {
        data: {
          id: name,
          label: name.replace(/Context$/, ""),
          modules: bc?.modules?.length ?? 0,
          color: CONTEXT_COLORS[classification] ?? "#64748b",
        },
      };
    });

    const edges = (ddd.context_map ?? []).map((cm, i) => ({
      data: {
        id: `ctx-edge-${i}`,
        source: cm.upstream_context,
        target: cm.downstream_context,
        label: RELATIONSHIP_ZH[cm.relationship] ?? cm.relationship,
        relationship: cm.relationship,
      },
    }));

    return { nodes, edges };
  }, [ddd]);

  if (nodes.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">{zh.scan.contextMapHint}</p>
      <DependencyGraph
        nodes={nodes.map((n) => ({
          ...n,
          data: {
            ...n.data,
            label: `${n.data.label}\n(${n.data.modules}模块)`,
          },
        }))}
        edges={edges}
        height={height}
        nodeColorKey="color"
        edgeLabelKey="label"
      />
      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        {(ddd.context_map ?? []).map((cm, i) => (
          <span key={i} className="rounded bg-slate-100 px-2 py-1">
            {cm.upstream_context} → {cm.downstream_context}:{" "}
            {RELATIONSHIP_ZH[cm.relationship] ?? cm.relationship}
          </span>
        ))}
      </div>
    </div>
  );
}
