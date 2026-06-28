"use client";

import { useEffect, useRef } from "react";
import cytoscape, { Core } from "cytoscape";

interface GraphProps {
  nodes: Array<{ data: Record<string, unknown> }>;
  edges: Array<{ data: Record<string, unknown> }>;
  height?: number;
}

export function DependencyGraph({ nodes, edges, height = 480 }: GraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": "10px",
            "background-color": "#64748b",
            color: "#fff",
            width: 40,
            height: 40,
          },
        },
        {
          selector: 'node[?inCycle]',
          style: { "background-color": "#dc2626" },
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "#94a3b8",
            "target-arrow-color": "#94a3b8",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
          },
        },
      ],
      layout: { name: "cose", animate: false, padding: 30 },
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
    };
  }, [nodes, edges]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg border border-slate-200 bg-slate-50"
      style={{ height }}
    />
  );
}
