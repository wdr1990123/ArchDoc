# ArchDoc Architecture

Enterprise on-prem multi-repository .NET architecture diagnosis platform.

## Components

| Component | Path | Role |
|-----------|------|------|
| Web UI + BFF | `web/` | Next.js dashboard, REST API |
| Scanner | `scanner/` | Roslyn CLI, metrics engine |
| Schema | `packages/scan-result.schema.json` | Scan upload contract |
| Migrations | `db/migrations/` | PostgreSQL schema |

## Data Flow

```
archdoc-scan.exe → POST /api/v1/scans/upload → PostgreSQL
User → POST /api/v1/scans/:id/diagnose → job_queue → LLM → diagnostic_reports
Multi-scan → POST /api/v1/domains/:id/snapshot → cross_repo_dependencies
```

## LLM Provider Abstraction

Configure via environment variables. Supports any OpenAI-compatible API:

- OpenAI / DeepSeek (development)
- Private Qwen (production)

Only structured metrics, issues, and type summaries are sent to LLM — not full source code.

## Metrics

| Code | Name |
|------|------|
| M01 | Efferent coupling (Ce) |
| M02 | Afferent coupling (Ca) |
| M03 | Instability |
| M04 | Cycle membership |
| M05 | Layer violation count |

## Federation (Phase 3)

`domain_snapshots` aggregate multiple `scan_runs` across repositories. Cross-repo edges are detected via internal NuGet `PackageReference` matching project `AssemblyName`.

## Future

- pgvector RAG when embedding model available
- CI integration templates
- LDAP authentication
