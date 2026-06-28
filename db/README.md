# 数据库迁移

ArchDoc 使用 PostgreSQL，表位于 **`ArchDoc` schema**（默认连接 `postgres` 库）。

## 推荐方式

```bash
cd web
cp .env.example .env.local   # 设置 DATABASE_URL
npm run db:init
```

## 手动执行

```bash
psql "postgresql://postgres:PASSWORD@localhost:5432/postgres" \
  -c 'CREATE SCHEMA IF NOT EXISTS "ArchDoc"'

psql "postgresql://postgres:PASSWORD@localhost:5432/postgres" \
  -c 'SET search_path TO "ArchDoc"' -f db/migrations/001_init.sql

psql "postgresql://postgres:PASSWORD@localhost:5432/postgres" \
  -c 'SET search_path TO "ArchDoc"' -f db/migrations/002_jobs.sql
```

## 连接串

```
postgresql://postgres:PASSWORD@localhost:5432/postgres?options=-c%20search_path%3D%22ArchDoc%22
```

迁移文件按顺序执行：

1. `001_init.sql` — 核心表（诊断域、仓库、扫描、指标、问题、报告、app_settings）
2. `002_jobs.sql` — 任务队列
