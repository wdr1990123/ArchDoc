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
