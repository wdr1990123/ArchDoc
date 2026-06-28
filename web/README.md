# ArchDoc Web

Next.js 14 前端与 BFF（REST API）。

完整说明见项目根目录 [README.md](../README.md)。

## 常用命令

```bash
npm install
cp .env.example .env.local   # 配置 DATABASE_URL 等
npm run db:init              # 初始化 PostgreSQL schema
npm run dev                  # 开发服务器 http://localhost:3000
npm run build                # 生产构建
npm run test:api             # API 自动化测试
npm run test:api:report      # 测试 + 覆盖率 + Markdown 报告
npm run db:init:test         # 初始化独立测试 schema（ArchDoc_test）
```

## API 自动化测试

默认使用 `.env.local` 中的 `DATABASE_URL`（开发库），并具备以下保护：

| 机制 | 说明 |
|------|------|
| **LLM 配置备份/恢复** | 测试开始前备份 `app_settings.llm_profiles`，结束后自动还原，避免覆盖你在设置页保存的大模型 |
| **测试数据清理** | 自动删除带 `Automated test fixture` 等标记的诊断项目 |
| **LLM Mock** | 诊断相关接口不调用真实大模型 |

**推荐（可选）**：在 `.env.local` 配置 `DATABASE_URL_TEST` 指向独立 schema，与开发数据完全隔离：

```bash
npm run db:init:test   # 首次初始化 ArchDoc_test
npm run test:api
```

详见 [.env.example](.env.example) 中的 `DATABASE_URL_TEST` 说明。

## 环境变量

见 [.env.example](.env.example)。`.env.local` 已被 git 忽略，请勿提交。
