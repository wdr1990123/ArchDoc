import { describe, expect, it } from "vitest";
import { indexModuleTypeEvidence } from "@/lib/metrics/moduleContextPack";
import { validateReport } from "@/lib/validation/reportValidator";
import type { AiReportContent } from "@/lib/types";
import type { ModuleContextPack } from "@/lib/metrics/moduleContextPack";

/** Acceptance fixture modeled on iMES module report structure */
describe("iMES-style module intent acceptance", () => {
  const moduleName = "iMES.Bll";
  const context: ModuleContextPack = {
    module_name: moduleName,
    module_id: "imes-bll-id",
    external_id: "mod-imes-bll",
    layer: "bll",
    loc: 45000,
    ce: 8,
    ca: 4,
    issue_count: 3,
    schema_version: "1.2",
    has_deep_read: true,
    summary: {
      top_types: ["OrderService", "WorkOrderService", "MaterialService"],
      snippet: "iMES.Bll: 5 个 Service、2 个 Controller；入口：OrderService.Create(...)",
      role_hints: ["Service", "Controller"],
    },
    metadata: {
      public_surface: [
        {
          module_id: "mod-imes-bll",
          type_name: "OrderService",
          kind: "class",
          members: ["Create(OrderDto)", "GetById(int)"],
        },
        {
          module_id: "mod-imes-bll",
          type_name: "WorkOrderService",
          kind: "class",
          members: ["Start(int)", "Complete(int)"],
        },
      ],
      role_hints: ["Service", "Controller"],
    },
    dependencies: {
      upstream: ["iMES.Dal", "iMES.Common"],
      downstream: ["iMES.Web"],
      project_refs: [],
    },
    issues: [],
    metrics: [],
    type_dependencies: [],
    package_refs: [],
  };

  const evidenceIndex = new Map<string, boolean>();
  const publicTypeNames = indexModuleTypeEvidence(evidenceIndex, context);

  const report: AiReportContent = {
    report_version: "2.0",
    summary: "iMES.Bll 是核心业务逻辑层，负责生产订单与工单处理。",
    module_intent: {
      module_name: moduleName,
      purpose:
        "iMES.Bll 位于业务逻辑层，封装 MES 核心业务规则，协调 UI 层与数据访问层，处理订单、工单与物料相关的业务流程。",
      business_capabilities: ["生产订单管理", "工单执行与状态流转", "物料消耗记录"],
      core_entities: ["Order", "WorkOrder", "MaterialConsumption"],
      key_workflows: [
        {
          name: "创建生产订单",
          description: "Web 层调用 OrderService.Create，BLL 校验后通过 DAL 持久化订单。",
          involved_modules: ["iMES.Web", "iMES.Dal"],
          evidence: [
            {
              ref: `module:${moduleName}`,
              label: moduleName,
              kind: "inference",
              confidence: "high",
            },
            {
              ref: "dep:iMES.Bll->iMES.Dal",
              label: "iMES.Bll → iMES.Dal",
              kind: "inference",
              confidence: "medium",
            },
          ],
        },
      ],
      external_interfaces: [
        {
          name: "OrderService",
          kind: "service",
          summary: "订单 CRUD 与业务校验入口",
          evidence: [
            { ref: `type:${moduleName}:OrderService`, label: "OrderService", kind: "fact" },
          ],
        },
        {
          name: "WorkOrderService",
          kind: "service",
          summary: "工单启动与完工",
          evidence: [
            {
              ref: `type:${moduleName}:WorkOrderService`,
              label: "WorkOrderService",
              kind: "fact",
            },
          ],
        },
      ],
      upstream_modules: context.dependencies.upstream,
      downstream_modules: context.dependencies.downstream,
      confidence: "high",
      evidence: [{ ref: `module:${moduleName}`, label: moduleName, kind: "fact" }],
    },
    risks: [],
    quick_wins: [],
    refactoring_recommendations: [],
  };

  evidenceIndex.set(`module:${moduleName}`, true);
  evidenceIndex.set("dep:iMES.Bll->iMES.Dal", true);

  it("meets acceptance: purpose + capabilities + entities + workflow + interfaces", () => {
    const intent = report.module_intent!;
    expect(intent.purpose.length).toBeGreaterThan(20);
    expect(intent.business_capabilities.length).toBeGreaterThanOrEqual(2);
    expect(intent.core_entities.length).toBeGreaterThanOrEqual(2);
    expect(intent.key_workflows.length).toBeGreaterThanOrEqual(1);
    expect(intent.external_interfaces.length).toBeGreaterThan(0);
  });

  it("indexes public type evidence for click-through validation", () => {
    expect(publicTypeNames.has("OrderService")).toBe(true);
    expect(evidenceIndex.has(`type:${moduleName}:OrderService`)).toBe(true);
  });

  it("passes report validation with fact evidence refs", () => {
    const result = validateReport(report, evidenceIndex, 0, {
      moduleReport: true,
      publicTypeNames,
    });
    expect(result.valid).toBe(true);
  });

  it("has >=80% evidence refs registered in index", () => {
    const refs: string[] = [];
    for (const wf of report.module_intent!.key_workflows) {
      refs.push(...(wf.evidence?.map((e) => e.ref) ?? []));
    }
    for (const iface of report.module_intent!.external_interfaces) {
      refs.push(...(iface.evidence?.map((e) => e.ref) ?? []));
    }
    const registered = refs.filter((r) => evidenceIndex.has(r)).length;
    expect(registered / refs.length).toBeGreaterThanOrEqual(0.8);
  });
});
