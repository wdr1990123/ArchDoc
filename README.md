# ArchDoc

面向 .NET 多仓库/多服务的**架构诊断平台**：Roslyn 静态扫描提取代码事实，PostgreSQL 存储指标与依赖关系，OpenAI 兼容 LLM 生成带证据链的重构与绞杀者迁移建议。

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

## 使用流程

1. 首页创建**诊断项目**
2. 进入诊断项目 → **代码仓库** → 添加仓库，复制仓库 ID
3. 本地运行 `archdoc-scan` 扫描并上传
4. 查看健康分、雷达图、依赖图、问题清单
5. 点击 **生成 AI 诊断报告**（需配置 LLM）

## 主要页面

| 路由 | 功能 |
|------|------|
| `/` | 诊断项目列表 |
| `/domains/[id]` | 诊断项目详情、跨仓库快照 |
| `/domains/[id]/repositories` | 仓库管理 |
| `/domains/[id]/scans/[scanId]` | 扫描概览、AI 诊断 |
| `/domains/[id]/scans/[scanId]/graph` | Cytoscape 依赖图 |
| `/domains/[id]/scans/[scanId]/issues` | 架构问题清单 |
| `/settings` | 系统设置、LLM 多模型配置 |

## API

基础路径：`/api/v1`（写操作需请求头 `X-Api-Key`）

| 端点 | 说明 |
|------|------|
| `GET /health` | 系统与数据库健康检查 |
| `GET /health/llm` | LLM 连接测试 |
| `GET/PUT /settings/llm` | 读取/保存模型配置 |
| `POST /settings/llm/test` | 测试指定模型 |
| `POST /domains` | 创建诊断项目 |
| `DELETE /domains/:id` | 删除诊断项目（级联删除下属数据） |
| `POST /repositories` | 注册仓库 |
| `POST /scans/upload` | 上传扫描结果 |
| `POST /scans/:id/diagnose` | 触发 AI 诊断 |
| `POST /domains/:id/snapshot` | 创建跨仓库快照 |
| `GET /jobs/poll` | 后台任务轮询（可 cron 调用） |

扫描结果 JSON Schema：[packages/scan-result.schema.json](packages/scan-result.schema.json)

## 项目结构

```
ArchDoc/
├── web/          # Next.js 前端 + REST API
├── scanner/      # .NET Roslyn 扫描 CLI
├── db/           # PostgreSQL 迁移脚本
├── packages/     # 扫描契约 Schema
├── docs/         # 架构与部署文档
└── scripts/      # 工具脚本（含 transcript 恢复）
```

## 部署

企业内网部署见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

架构说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 开发命令

```bash
# Web
cd web && npm run dev      # 开发
cd web && npm run build    # 生产构建
cd web && npm run db:init   # 初始化数据库

# Scanner
cd scanner && dotnet build -c Release
```
