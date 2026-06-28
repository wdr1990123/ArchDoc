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
```

## 环境变量

见 [.env.example](.env.example)。`.env.local` 已被 git 忽略，请勿提交。
