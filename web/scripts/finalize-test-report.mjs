import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportDir = path.resolve(__dirname, "../test-reports");
const statePath = path.join(reportDir, "report-state.json");
const summaryPath = path.join(reportDir, "coverage/coverage-summary.json");
const outputPath = path.join(reportDir, "api-test-report.md");

function formatPct(value) {
  if (value === undefined || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(1)}%`;
}

function buildCoverageSection() {
  if (!fs.existsSync(summaryPath)) {
    return "_覆盖率数据不可用（请使用 `npm run test:api:report` 运行）_";
  }

  const coverage = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const topFiles = Object.entries(coverage)
    .filter(([key]) => key !== "total")
    .map(([filePath, stats]) => ({
      filePath: filePath.replace(process.cwd(), "").replace(/\\/g, "/"),
      pct: stats.statements.pct,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);

  return [
    "| 指标 | 覆盖率 |",
    "|------|--------|",
    `| Statements | ${formatPct(coverage.total.statements.pct)} |`,
    `| Branches | ${formatPct(coverage.total.branches.pct)} |`,
    `| Functions | ${formatPct(coverage.total.functions.pct)} |`,
    `| Lines | ${formatPct(coverage.total.lines.pct)} |`,
    "",
    "详细 HTML 报告: [test-reports/coverage/index.html](coverage/index.html)",
    "",
    "### 按文件覆盖率 Top 10",
    "",
    "| 文件 | Statements |",
    "|------|------------|",
    ...topFiles.map((f) => `| ${f.filePath} | ${formatPct(f.pct)} |`),
  ].join("\n");
}

if (!fs.existsSync(statePath)) {
  console.error("Missing report-state.json. Run vitest with the markdown reporter first.");
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const endpointRows = state.endpoints
  .map(
    (row) => `| ${row.method} | ${row.path} | ${row.total} | ${row.passed} | ${row.failed} |`
  )
  .join("\n");

const markdown = [
  "# ArchDoc API 自动化测试报告",
  "",
  `- 运行时间: ${state.runAt}`,
  `- 总用例: ${state.counts.total} | 通过: ${state.counts.passed} | 失败: ${state.counts.failed} | 跳过: ${state.counts.skipped}`,
  `- 耗时: ${state.durationSec}s`,
  "",
  "## 端点覆盖",
  "",
  "| 方法 | 路径 | 用例数 | 通过 | 失败 |",
  "|------|------|--------|------|------|",
  endpointRows || "| - | - | 0 | 0 | 0 |",
  "",
  "## 失败详情",
  "",
  state.failures.length ? state.failures.join("\n") : "全部通过",
  "",
  "## 代码覆盖率",
  "",
  buildCoverageSection(),
  "",
].join("\n");

fs.writeFileSync(outputPath, markdown, "utf8");
console.log(`Markdown report written to ${outputPath}`);
