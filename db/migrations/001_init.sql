-- ArchDoc MVP schema v1
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE diagnosis_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES diagnosis_domains(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'local' CHECK (source_type IN ('git', 'local', 'agent')),
    repo_url TEXT,
    solution_path TEXT,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_repositories_domain_id ON repositories(domain_id);

CREATE TABLE scan_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    solution_path TEXT,
    commit_sha TEXT,
    schema_version TEXT NOT NULL DEFAULT '1.0',
    artifact JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scan_runs_repository_id ON scan_runs(repository_id);
CREATE INDEX idx_scan_runs_status ON scan_runs(status);

CREATE TABLE modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_run_id UUID NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'project' CHECK (kind IN ('project', 'namespace')),
    loc INTEGER NOT NULL DEFAULT 0,
    layer TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    UNIQUE (scan_run_id, external_id)
);

CREATE INDEX idx_modules_scan_run_id ON modules(scan_run_id);

CREATE TABLE dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_run_id UUID NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
    from_module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    to_module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'project_ref',
    weight INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_dependencies_scan_run_id ON dependencies(scan_run_id);

CREATE TABLE metric_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_run_id UUID NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
    module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    value NUMERIC NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_metric_values_scan_run_id ON metric_values(scan_run_id);
CREATE INDEX idx_metric_values_code ON metric_values(code);

CREATE TABLE diagnostic_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_run_id UUID NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
    rule_id TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    message TEXT NOT NULL,
    module_ids UUID[] NOT NULL DEFAULT '{}',
    location JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_diagnostic_issues_scan_run_id ON diagnostic_issues(scan_run_id);
CREATE INDEX idx_diagnostic_issues_severity ON diagnostic_issues(severity);

CREATE TABLE diagnostic_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_run_id UUID NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed')),
    report_type TEXT NOT NULL DEFAULT 'project' CHECK (report_type IN ('project', 'module', 'domain')),
    content JSONB NOT NULL DEFAULT '{}',
    validation_errors JSONB NOT NULL DEFAULT '[]',
    markdown TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX idx_diagnostic_reports_scan_run_id ON diagnostic_reports(scan_run_id);

CREATE TABLE refactoring_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES diagnostic_reports(id) ON DELETE CASCADE,
    effort TEXT NOT NULL CHECK (effort IN ('S', 'M', 'L')),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    evidence_refs JSONB NOT NULL DEFAULT '[]',
    module_id UUID REFERENCES modules(id) ON DELETE SET NULL
);

CREATE INDEX idx_refactoring_recommendations_report_id ON refactoring_recommendations(report_id);

CREATE TABLE package_refs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_run_id UUID NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    package_id TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_package_refs_scan_run_id ON package_refs(scan_run_id);
CREATE INDEX idx_package_refs_package_id ON package_refs(package_id);

CREATE TABLE module_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_run_id UUID NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    top_types JSONB NOT NULL DEFAULT '[]',
    snippet TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_module_summaries_scan_run_id ON module_summaries(scan_run_id);

-- Phase 3 reserved tables
CREATE TABLE domain_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES diagnosis_domains(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    scan_run_ids UUID[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES diagnosis_domains(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE service_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cross_repo_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES domain_snapshots(id) ON DELETE CASCADE,
    from_service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    to_service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    from_module_name TEXT,
    to_module_name TEXT,
    kind TEXT NOT NULL DEFAULT 'nuget',
    package_id TEXT,
    version TEXT,
    weight INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_cross_repo_dependencies_snapshot_id ON cross_repo_dependencies(snapshot_id);

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
