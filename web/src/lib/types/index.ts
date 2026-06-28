export interface ScanResultModule {
  id: string;
  name: string;
  kind: "project" | "namespace";
  loc?: number;
  layer?: string;
}

export interface ScanResultDependency {
  from: string;
  to: string;
  kind: string;
  weight?: number;
}

export interface ScanResultMetric {
  module_id: string;
  code: string;
  value: number;
}

export interface ScanResultIssue {
  rule_id: string;
  severity: "critical" | "high" | "medium" | "low";
  module_ids?: string[];
  message: string;
  location?: Record<string, unknown>;
}

export interface ScanResultPackageRef {
  module_id: string;
  package_id: string;
  version?: string;
}

export interface ScanResultSummary {
  module_id: string;
  top_types?: string[];
  snippet?: string;
}

export interface ScanResultPayload {
  schema_version: string;
  repository_id: string;
  solution_path: string;
  scanned_at: string;
  commit_sha?: string;
  modules: ScanResultModule[];
  dependencies: ScanResultDependency[];
  package_refs?: ScanResultPackageRef[];
  metrics: ScanResultMetric[];
  issues: ScanResultIssue[];
  summaries?: ScanResultSummary[];
}

export interface DiagnosisDomain {
  id: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Repository {
  id: string;
  domain_id: string;
  name: string;
  source_type: string;
  repo_url: string | null;
  solution_path: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ScanRun {
  id: string;
  repository_id: string;
  status: string;
  solution_path: string | null;
  commit_sha: string | null;
  schema_version: string;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface ModuleRow {
  id: string;
  scan_run_id: string;
  external_id: string;
  name: string;
  kind: string;
  loc: number;
  layer: string | null;
}

export interface DiagnosticIssueRow {
  id: string;
  scan_run_id: string;
  rule_id: string;
  severity: string;
  message: string;
  module_ids: string[];
  location: Record<string, unknown>;
}

export interface DiagnosticReportRow {
  id: string;
  scan_run_id: string;
  status: string;
  report_type: string;
  content: Record<string, unknown>;
  validation_errors: unknown[];
  markdown: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface DomainSnapshotRow {
  id: string;
  domain_id: string;
  name: string;
  scan_run_ids: string[];
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CrossRepoDependencyRow {
  id: string;
  snapshot_id: string;
  from_service_id: string | null;
  to_service_id: string | null;
  from_module_name: string | null;
  to_module_name: string | null;
  kind: string;
  package_id: string | null;
  version: string | null;
  weight: number;
}

export interface AiReportContent {
  summary: string;
  risks: Array<{
    title: string;
    severity: string;
    description: string;
    evidence_refs: string[];
  }>;
  quick_wins: Array<{
    title: string;
    description: string;
    effort: "S" | "M" | "L";
    evidence_refs: string[];
  }>;
  refactoring_recommendations: Array<{
    title: string;
    category: string;
    description: string;
    effort: "S" | "M" | "L";
    evidence_refs: string[];
    module_name?: string;
  }>;
  strangler_candidates?: Array<{
    module_name: string;
    score: number;
    rationale: string;
    evidence_refs: string[];
  }>;
}
