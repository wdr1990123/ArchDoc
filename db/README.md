# 数据库迁移

ArchDoc 使用 PostgreSQL，表位于 **`ArchDoc` schema**（默认连接 `postgres` 库）。

## 推荐方式

```bash
cd web
cp .env.example .env.local   # 设置 DATABASE_URL（也支持 .env）
npm run db:init
```

脚本会读取 `web/.env.local` 或 `web/.env` 中的 `DATABASE_URL`（见 `web/scripts/lib/load-env.mjs`）。

## 手动执行

```bash
psql "postgresql://postgres:PASSWORD@localhost:5432/postgres" \
  -c 'CREATE SCHEMA IF NOT EXISTS "ArchDoc"'

psql "postgresql://postgres:PASSWORD@localhost:5432/postgres" \
  -c 'SET search_path TO "ArchDoc"' -f db/migrations/001_init.sql

psql "postgresql://postgres:PASSWORD@localhost:5432/postgres" \
  -c 'SET search_path TO "ArchDoc"' -f db/migrations/002_jobs.sql

psql "postgresql://postgres:PASSWORD@localhost:5432/postgres" \
  -c 'SET search_path TO "ArchDoc"' -f db/migrations/003_domain_name_unique.sql
```

## 已有库升级

若数据库已初始化，只需执行新增的迁移文件（不会重复建表）：

```bash
psql "postgresql://postgres:PASSWORD@localhost:5432/postgres" \
  -c 'SET search_path TO "ArchDoc"' -f db/migrations/003_domain_name_unique.sql
```

`003` 会合并同名诊断项目（保留最早创建的），并添加名称唯一索引。

或在 `web/` 目录执行：

```bash
npm run db:migrate
```

## 连接串

```
postgresql://postgres:PASSWORD@localhost:5432/postgres?options=-c%20search_path%3D%22ArchDoc%22
```

迁移文件按顺序执行：

1. `001_init.sql` — 核心表（诊断项目、仓库、扫描、指标、问题、报告、app_settings）
2. `002_jobs.sql` — 任务队列
3. `003_domain_name_unique.sql` — 诊断项目名称去重（保留最早创建的记录）
