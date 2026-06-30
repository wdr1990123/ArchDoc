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
  role_hints?: string[];
}

export interface ScanResultNamespace {
  module_id: string;
  name: string;
  type_count: number;
}

export interface ScanResultPublicType {
  module_id: string;
  type_name: string;
  kind: string;
  members?: string[];
}

export interface ScanResultTypeDependency {
  from_module_id: string;
  to_module_id: string;
  from_type: string;
  to_type: string;
  count: number;
}

export interface ScanResultFolderLayout {
  module_id: string;
  folders: string[];
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
  namespaces?: ScanResultNamespace[];
  public_surface?: ScanResultPublicType[];
  type_dependencies?: ScanResultTypeDependency[];
  folder_layout?: ScanResultFolderLayout[];
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
