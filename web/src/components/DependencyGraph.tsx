"use client";

import { useEffect, useRef } from "react";
import cytoscape, { Core } from "cytoscape";

interface GraphProps {
  nodes: Array<{ data: Record<string, unknown> }>;
  edges: Array<{ data: Record<string, unknown> }>;
  height?: number;
  highlightModuleId?: string;
  nodeColorKey?: string;
  edgeLabelKey?: string;
}

export function DependencyGraph({
  nodes,
  edges,
  height = 480,
  highlightModuleId,
  nodeColorKey,
  edgeLabelKey,
}: GraphProps) {
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
            "background-color": nodeColorKey ? "data(color)" : "#64748b",
            color: "#fff",
            width: nodeColorKey ? 56 : 40,
            height: nodeColorKey ? 56 : 40,
            "text-wrap": "wrap",
            "text-max-width": "80px",
          },
        },
        {
          selector: 'node[?inCycle]',
          style: { "background-color": "#dc2626" },
        },
        {
          selector: "node.highlighted",
          style: {
            "background-color": "#2563eb",
            width: 52,
            height: 52,
            "font-size": "11px",
            "border-width": 3,
            "border-color": "#1d4ed8",
          },
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "#94a3b8",
            "target-arrow-color": "#94a3b8",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            ...(edgeLabelKey
              ? {
                  label: `data(${edgeLabelKey})`,
                  "font-size": "9px",
                  color: "#475569",
                  "text-background-color": "#f8fafc",
                  "text-background-opacity": 0.85,
                  "text-background-padding": "2px",
                }
              : {}),
          },
        },
        {
          selector: "edge.highlighted",
          style: {
            width: 3,
            "line-color": "#2563eb",
            "target-arrow-color": "#2563eb",
          },
        },
      ],
      layout: { name: "cose", animate: false, padding: 30 },
    });

    if (highlightModuleId) {
      const node = cy.getElementById(highlightModuleId);
      if (node.length > 0) {
        node.addClass("highlighted");
        node.connectedEdges().addClass("highlighted");
        node.neighborhood("node").addClass("highlighted");
        cy.animate({ center: { eles: node }, zoom: 1.5 }, { duration: 300 });
      }
    }

    cyRef.current = cy;
    return () => {
      cy.destroy();
    };
  }, [nodes, edges, highlightModuleId, nodeColorKey, edgeLabelKey]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg border border-slate-200 bg-slate-50"
      style={{ height }}
    />
  );
}
