# ArchDoc Deployment Guide (On-Prem)

## Requirements

**Application server:**
- Node.js 18 LTS
- PostgreSQL 14+
- Reverse proxy (IIS / nginx) optional

**Scan agent (developer/CI machine):**
- .NET 8 SDK
- Git (optional)
- Network access to ArchDoc API and source code

**Not required:** Docker, Redis, Neo4j, object storage

## Build Web App

```bash
cd web
npm ci
npm run build
```

Next.js is configured with `output: "standalone"`. Deploy `.next/standalone` plus `public/` and `.next/static/`.

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@db-host:5432/archdoc
ARCHDOC_API_KEY=<strong-random-key>
LLM_BASE_URL=http://qwen.internal/v1
LLM_API_KEY=<key>
LLM_MODEL=qwen2.5-72b-instruct
JOB_WORKER_ENABLED=true
JOB_POLL_INTERVAL_MS=3000
```

For public LLM testing during development:

```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o
```

## Windows Service (example)

Use `nssm` or similar to run:

```
node D:\archdoc\web\server.js
```

Set port via `PORT=3000`.

## Scanner Distribution

Build release binary:

```bash
cd scanner
dotnet publish ArchDoc.Cli -c Release -r win-x64 --self-contained false
```

Distribute `archdoc-scan.exe` with `NuGet.Config` pointing to private feed.

## Security Notes

- Scanner uploads metrics/issues/summaries only — not full source code
- Use TLS for API in production
- Rotate `ARCHDOC_API_KEY` regularly
- Switch LLM to private Qwen before production code analysis
