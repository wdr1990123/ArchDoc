# ArchDoc

面向 .NET 多仓库/多服务的**架构诊断平台**：Roslyn 静态扫描提取可验证的代码事实，PostgreSQL 存储指标与依赖关系，OpenAI 兼容 LLM 生成带证据链的**架构治理行动方案**（限界上下文、治理行动台账、绞杀者路线）。

## 核心能力

| 能力 | 说明 |
|------|------|
| 静态扫描 | 模块依赖、耦合指标（Ce/Ca）、分层违规、循环依赖 |
| 深读分析 | scan-result schema 1.1+：Public API、命名空间、God Class 等 |
| 项目级报告 | Report 2.1：治理摘要 → DDD 上下文 → 行动台账 → 诊断附录 |
| 模块级报告 | 单模块业务意图、聚合候选、边界治理建议 |
| 证据可验证 | 报告条目可点击跳转 Issue / 依赖 / 类型等事实来源 |
| 绞杀者候选 | Top 5 拆分评分 + 分阶段迁移路线 |
| 多仓联邦 | 跨仓库快照与联邦依赖图（Phase 3，待端到端验收） |

## 技术栈

| 组件 | 技术 | 目录 |
|------|------|------|
| Web UI + BFF | Next.js 14、TypeScript | `web/` |
| 数据库 | PostgreSQL 14+（单库 + `ArchDoc` schema） | `db/` |
| 扫描器 | .NET 8 + Roslyn CLI | `scanner/` |
| 大模型 | OpenAI 兼容 API（UI 可配置多模型） | 系统设置 |

**不需要：** Docker、Redis、Neo4j、对象存储。

## 环境要求

- Node.js 18+
- PostgreSQL 14+
- .NET 8 SDK（仅 Scanner 端）

## 快速开始

### 1. 数据库

在 PostgreSQL 中创建 `ArchDoc` schema 并执行迁移：

```bash
cd web
cp .env.example .env.local   # 修改 DATABASE_URL 密码
npm install
npm run db:init
```

连接串示例（使用 `postgres` 库 + `ArchDoc` schema）：

```
postgresql://postgres:YOUR_PASSWORD@localhost:5432/postgres?options=-c%20search_path%3D%22ArchDoc%22
```

详见 [db/README.md](db/README.md)。

### 2. 启动 Web

```bash
cd web
npm run dev
```

浏览器打开 http://localhost:3000

### 3. 配置

1. 打开 **系统设置**（`/settings`）
2. 填写 API 密钥（默认 `dev-secret-key`，与 `ARCHDOC_API_KEY` 一致）
3. 添加大模型配置（支持 OpenAI、DeepSeek、通义、私有 Qwen 等 OpenAI 兼容接口）

环境变量兜底见 `web/.env.example`。

### 4. Scanner CLI

```bash
cd scanner
dotnet build -c Release
dotnet run --project ArchDoc.Cli -- \
  --solution D:/path/to/Your.sln \
  --repository-id <仓库UUID> \
  --api-url http://localhost:3000/api/v1 \
  --api-key dev-secret-key \
  --output scan-result.json
```

**简化用法**（自动注册仓库，无需预先复制 UUID）：

```powershell
dotnet run --project ArchDoc.Cli -- `
  --solution D:\path\to\Your.sln `
  --domain-id <诊断项目UUID> `
  --repo-name "MyRepo" `
  --api-url http://localhost:3000/api/v1 `
  --api-key dev-secret-key `
  --diagnose
```

## 使用流程

### 标准流程

1. 首页创建**诊断项目**（或使用 `/quick-start` 快速开始向导）
2. 进入诊断项目 → **代码仓库** → 添加仓库，复制仓库 ID
3. 本地运行 Scanner 扫描并上传
4. 查看健康分、雷达图、**架构结构**、依赖图、问题清单
5. 点击 **生成 AI 诊断报告**（需配置 LLM）
6. 在报告页查看治理行动方案；Issues 页可看到关联的治理行动

### 模块级报告

在扫描概览或架构结构页，对单个模块点击 **模块诊断**，生成该模块的业务意图与 DDD 边界治理报告（需项目已配置 LLM）。

## 主要页面

| 路由 | 功能 |
|------|------|
| `/` | 诊断项目列表 |
| `/quick-start` | 3 步快速开始（创建 → 扫描 → 查看） |
| `/domains/[id]` | 诊断项目详情、跨仓库快照 |
| `/domains/[id]/repositories` | 仓库管理 |
| `/domains/[id]/scans/[scanId]` | 扫描概览、AI 诊断入口 |
| `/domains/[id]/scans/[scanId]/architecture` | 分层结构、模块职责、模块诊断 |
| `/domains/[id]/scans/[scanId]/graph` | Cytoscape 依赖图 |
| `/domains/[id]/scans/[scanId]/issues` | 架构问题清单（含关联治理行动） |
| `/domains/[id]/scans/[scanId]/reports/[reportId]` | AI 报告（项目 / 模块） |
| `/domains/[id]/federation` | 跨仓联邦依赖图 |
| `/settings` | 系统设置、LLM 多模型配置 |

## 报告规格

| 版本 | 说明 | Schema |
|------|------|--------|
| scan-result 1.1+ | 扫描产物，含 public_surface、深读指标 | [scan-result.schema.json](packages/scan-result.schema.json) |
| Report 2.0 | 可验证架构解读（结构事实 + 模块职责 + Issue 解读） | — |
| Report 2.1 | DDD 治理行动方案（executive_summary、governance_plan、ddd_governance） | [report.schema.json](packages/report.schema.json) |

设计原则：**Facts First**（70% 来自 Scanner）、**Structure Before Opinion**、**Click to Verify**。

## API

基础路径：`/api/v1`（写操作需请求头 `X-Api-Key`）

| 端点 | 说明 |
|------|------|
| `GET /health` | 系统与数据库健康检查 |
| `GET /health/llm` | LLM 连接测试 |
| `GET/PUT /settings/llm` | 读取/保存模型配置 |
| `POST /settings/llm/test` | 测试指定模型 |
| `POST /domains` | 创建诊断项目 |
| `POST /domains/quick-start` | 一次创建诊断项目 + 仓库 |
| `DELETE /domains/:id` | 删除诊断项目（级联删除下属数据） |
| `POST /repositories` | 注册仓库 |
| `POST /scans/upload` | 上传扫描结果 |
| `POST /scans/:id/diagnose` | 触发 AI 诊断（`report_type`: `project` \| `module`） |
| `POST /domains/:id/snapshot` | 创建跨仓库快照 |
| `GET /jobs/poll` | 后台任务轮询（可 cron 调用） |
| `GET /jobs/:id` | 查询单个 job 状态 |

## 项目结构

```
ArchDoc/
├── web/                         # Next.js 前端 + REST API
│   ├── src/app/                 # 路由页面 + api/v1 REST handlers
│   ├── src/components/          # UI 组件（按功能域分子目录）
│   │   ├── layout/              # AppNav、Breadcrumbs、ui
│   │   ├── domains/             # 诊断项目相关
│   │   ├── repositories/        # 仓库管理
│   │   ├── scans/               # 扫描、诊断按钮
│   │   ├── reports/             # 报告展示
│   │   ├── graph/               # 依赖图
│   │   ├── settings/            # 系统设置
│   │   └── shared/              # 跨页通用（QuickStart 等）
│   ├── src/lib/                 # 业务逻辑
│   │   ├── db/                  # PostgreSQL 连接与查询
│   │   ├── jobs/                # 诊断任务队列
│   │   ├── llm/                 # 大模型抽象与 prompts
│   │   ├── governance/          # 治理行动、DDD 关联
│   │   ├── metrics/             # 结构事实、指标
│   │   └── validation/          # 报告校验
│   ├── scripts/                 # npm db:* 等脚本
│   └── tests/                   # Vitest API + 单元测试
├── scanner/                     # .NET Roslyn 扫描 CLI
├── db/migrations/               # PostgreSQL 迁移脚本
├── packages/                    # JSON Schema 契约
├── docs/                        # 架构与部署文档
└── scripts/                     # 仓库级开发工具
```

## 部署

企业内网部署见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

架构说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

**完整方案与进度追踪**见 [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md)（Living Document，沟通调整方案时同步更新）。

## 开发命令

```bash
# Web
cd web && npm run dev          # 开发
cd web && npm run build        # 生产构建
cd web && npm run db:init      # 初始化数据库
cd web && npm run test:api     # Vitest（API + 单元测试）

# Scanner
cd scanner && dotnet build -c Release
```

## 当前进度（摘要）

| 阶段 | 状态 |
|------|------|
| Phase 0–2 MVP | ✅ 已验收 |
| Phase 2.5 Report V2（结构页、模块报告、Scanner 深读） | ✅ |
| Report 2.1 治理行动方案 | ✅ |
| Phase 3 多仓联邦 | 代码已有，待端到端验收 |

详情见 [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md) §15。
