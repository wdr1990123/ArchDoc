import fs from "fs";
import path from "path";
import type { Reporter, TestModule, TestCase } from "vitest/node";

interface EndpointStats {
  method: string;
  path: string;
  total: number;
  passed: number;
  failed: number;
}

interface ReportState {
  runAt: string;
  durationSec: string;
  counts: { total: number; passed: number; failed: number; skipped: number };
  endpoints: EndpointStats[];
  failures: string[];
}

function parseEndpoint(suiteName: string): { method: string; path: string } | null {
  const match = suiteName.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(\/api\/v1\/[^\s]+)/i);
  if (!match) return null;
  return { method: match[1].toUpperCase(), path: match[2] };
}

function findEndpointName(testCase: TestCase): string | null {
  let parent = testCase.parent;
  while (parent.type !== "module") {
    const endpoint = parseEndpoint(parent.name);
    if (endpoint) {
      return `${endpoint.method} ${endpoint.path}`;
    }
    parent = parent.parent;
  }
  return null;
}

export default class MarkdownReporter implements Reporter {
  private startTime = Date.now();

  onInit() {
    this.startTime = Date.now();
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>, unhandledErrors: ReadonlyArray<unknown>) {
    const endpointMap = new Map<string, EndpointStats>();
    const failures: string[] = [];
    const counts = { total: 0, passed: 0, failed: 0, skipped: 0 };

    for (const module of testModules) {
      for (const testCase of module.children.allTests()) {
        const result = testCase.result();
        counts.total += 1;

        if (result.state === "passed") counts.passed += 1;
        else if (result.state === "failed") counts.failed += 1;
        else if (result.state === "skipped") counts.skipped += 1;

        const endpointKey = findEndpointName(testCase);
        const parsed = endpointKey ? parseEndpoint(endpointKey) : null;
        const key = endpointKey ?? testCase.fullName;
        const stats = endpointMap.get(key) ?? {
          method: parsed?.method ?? "-",
          path: parsed?.path ?? key,
          total: 0,
          passed: 0,
          failed: 0,
        };

        stats.total += 1;
        if (result.state === "passed") stats.passed += 1;
        else if (result.state === "failed") {
          stats.failed += 1;
          const err =
            result.state === "failed"
              ? result.errors.map((e) => e.message).join("; ")
              : "Unknown error";
          failures.push(`- **${key}** / ${testCase.name}: ${err}`);
        }
        endpointMap.set(key, stats);
      }
    }

    for (const err of unhandledErrors) {
      failures.push(`- **Unhandled error**: ${String(err)}`);
      counts.failed += 1;
      counts.total += 1;
    }

    const reportDir = path.resolve(process.cwd(), "test-reports");
    fs.mkdirSync(reportDir, { recursive: true });

    const state: ReportState = {
      runAt: new Date().toISOString(),
      durationSec: ((Date.now() - this.startTime) / 1000).toFixed(1),
      counts,
      endpoints: Array.from(endpointMap.values()).sort(
        (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)
      ),
      failures,
    };

    fs.writeFileSync(path.join(reportDir, "report-state.json"), JSON.stringify(state, null, 2));
  }
}
