import { describe, expect, it } from "vitest";
import { buildModuleIntentPrompt } from "@/lib/llm/prompts";
import type { ModuleContextPack } from "@/lib/metrics/moduleContextPack";

const sampleContext: ModuleContextPack = {
  module_name: "iMES.Bll",
  module_id: "uuid-1",
  external_id: "mod-1",
  layer: "bll",
  loc: 12000,
  ce: 5,
  ca: 3,
  issue_count: 2,
  schema_version: "1.2",
  has_deep_read: true,
  summary: {
    top_types: ["OrderService", "WorkOrderService"],
    snippet: "iMES.Bll: 3 个 Service、1 个 Controller",
    role_hints: ["Service", "Controller"],
  },
  metadata: {
    namespaces: [{ name: "iMES.Bll.Orders", type_count: 12 }],
    public_surface: [
      {
        module_id: "mod-1",
        type_name: "OrderService",
        kind: "class",
        members: ["Create(OrderDto)"],
      },
    ],
    folder_layout: ["Orders", "WorkOrders"],
    role_hints: ["Service"],
  },
  dependencies: {
    upstream: ["iMES.Dal"],
    downstream: ["iMES.Web"],
    project_refs: [{ from: "iMES.Bll", to: "iMES.Dal", ref: "dep:iMES.Bll->iMES.Dal" }],
  },
  issues: [{ id: "iss-1", rule_id: "GOD_CLASS", severity: "medium", message: "God Class" }],
  metrics: [{ id: "m-1", code: "M01", value: 5 }],
  type_dependencies: [
    { from_type: "OrderService", to_type: "OrderRepository", to_module_name: "iMES.Dal", count: 8 },
  ],
  package_refs: [],
};

describe("buildModuleIntentPrompt", () => {
  it("includes full module context and module_intent schema", () => {
    const { system, user } = buildModuleIntentPrompt({
      projectName: "iMES",
      solutionPath: "iMES.sln",
      healthScore: 72,
      context: sampleContext,
    });

    expect(system).toContain("module_intent");
    expect(user).toContain("iMES.Bll");
    expect(user).toContain("OrderService");
    expect(user).toContain("business_capabilities");
    expect(user).toContain("key_workflows");
    expect(user).toContain("external_interfaces");
    expect(user).not.toContain("深读数据不足");
  });

  it("warns when deep read data is missing", () => {
    const { user } = buildModuleIntentPrompt({
      projectName: "iMES",
      solutionPath: "iMES.sln",
      healthScore: 72,
      context: { ...sampleContext, has_deep_read: false, metadata: {} },
    });

    expect(user).toContain("深读数据不足");
  });
});
