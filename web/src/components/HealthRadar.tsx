"use client";

import dynamic from "next/dynamic";

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">
      加载雷达图…
    </div>
  ),
});

interface RadarProps {
  dimensions: string[];
  values: number[];
}

const LABELS: Record<string, string> = {
  Ce: "传出耦合",
  Ca: "传入耦合",
  Stability: "稳定性",
  Acyclic: "无环性",
  LayerCompliance: "分层合规",
};

export function HealthRadar({ dimensions, values }: RadarProps) {
  const option = {
    radar: {
      indicator: dimensions.map((name) => ({
        name: LABELS[name] ?? name,
        max: 100,
      })),
      radius: "62%",
      splitNumber: 4,
      axisName: { color: "#64748b", fontSize: 11 },
    },
    series: [
      {
        type: "radar",
        data: [{ value: values, name: "健康度" }],
        areaStyle: { opacity: 0.25, color: "#334155" },
        lineStyle: { color: "#334155" },
        itemStyle: { color: "#334155" },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 300 }} />;
}
