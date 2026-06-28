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

export interface EvidenceItem {
  ref: string;
  label: string;
  kind: "fact" | "inference";
  confidence?: "high" | "medium" | "low";
}

export interface EvidenceCatalogEntry extends EvidenceItem {
  link?: string;
  detail?: string;
}

export interface ArchitectureOverviewFact {
  module_count: number;
  total_loc: number;
  health_score: number;
  layer_distribution: Record<string, string[]>;
  issue_count: number;
}

export interface ModuleRoleEntry {
  module_name: string;
  layer: string;
  responsibility_hypothesis: string;
  confidence: "high" | "medium" | "low";
  key_types: string[];
  evidence: EvidenceItem[];
}

export interface DesignHypothesis {
  title: string;
  description: string;
  confidence: "high" | "medium" | "low";
  based_on_refs: string[];
}

export interface IssueInterpretation {
  issue_ref: string;
  rule_id: string;
  severity: string;
  message: string;
  module_names?: string[];
  interpretation: string;
  evidence?: EvidenceItem[];
}

export interface StranglerRoadmapStep {
  phase: number;
  title: string;
  module_name: string;
  prerequisites: string[];
  rationale: string;
  evidence: EvidenceItem[];
}

export interface ModuleIntentDetail {
  module_name: string;
  purpose: string;
  business_capabilities: string[];
  core_entities: string[];
  key_workflows: Array<{
    name: string;
    description: string;
    involved_modules?: string[];
    evidence: EvidenceItem[];
  }>;
  external_interfaces: Array<{
    name: string;
    kind: string;
    summary: string;
    evidence: EvidenceItem[];
  }>;
  upstream_modules: string[];
  downstream_modules: string[];
  confidence: "high" | "medium" | "low";
  evidence: EvidenceItem[];
}

export type GovernancePhase = "short" | "mid" | "long";

export type GovernanceActionCategory =
  | "architecture"
  | "application"
  | "technical_debt"
  | "boundary"
  | "dependency"
  | "ddd_context"
  | "ddd_aggregate"
  | "ddd_integration";

export type ContextRelationship =
  | "partnership"
  | "shared_kernel"
  | "customer_supplier"
  | "conformist"
  | "anticorruption_layer"
  | "open_host_service"
  | "published_language";

export type SubdomainClassification = "core" | "supporting" | "generic";

export type BoundedContextType = "existing" | "recommended_split" | "recommended_merge";

export type ModelingGapKind =
  | "anemic_domain"
  | "god_aggregate"
  | "cross_context_leak"
  | "missing_boundary"
  | "language_mismatch";

export interface ExecutiveSummary {
  governance_verdict: "proceed" | "watch" | "intervene";
  phase_goals: Array<{ phase: GovernancePhase; goal: string }>;
  top_actions: Array<{
    id: string;
    title: string;
    priority: string;
    effort: "S" | "M" | "L";
    expected_outcome: string;
  }>;
  ddd_boundary_conclusion?: string;
  defer_items?: string[];
  rescan_baseline?: {
    health_score: number;
    issue_count: number;
    target_health_score?: number;
    target_issue_reduction?: string;
  };
}

export interface GovernanceAction {
  id: string;
  title: string;
  category: GovernanceActionCategory;
  description: string;
  rationale: string;
  priority: "urgent" | "important" | "normal";
  impact: "high" | "medium" | "low";
  effort: "S" | "M" | "L";
  target_phase: GovernancePhase;
  target_modules: string[];
  prerequisites: string[];
  acceptance_criteria: string[];
  evidence: EvidenceItem[];
  evidence_refs?: string[];
  linked_issues?: string[];
  linked_actions?: string[];
  ddd_scope?: {
    bounded_context?: string;
    aggregate?: string;
    context_relationship?: string;
  };
}

export interface GovernancePlan {
  phases: Array<{
    phase: GovernancePhase;
    title: string;
    objectives: string[];
    success_metrics: string[];
  }>;
  actions: GovernanceAction[];
  strategy_notes?: string;
}

export interface DddGovernance {
  subdomain_landscape: Array<{
    name: string;
    classification: SubdomainClassification;
    rationale: string;
    related_modules: string[];
    confidence: "high" | "medium" | "low";
    evidence: EvidenceItem[];
  }>;
  bounded_contexts: Array<{
    name: string;
    business_capability: string;
    modules: string[];
    namespace_hints?: string[];
    context_type: BoundedContextType;
    boundary_rationale: string;
    ubiquitous_language: string[];
    confidence: "high" | "medium" | "low";
    evidence: EvidenceItem[];
    linked_governance_actions?: string[];
  }>;
  context_map: Array<{
    upstream_context: string;
    downstream_context: string;
    relationship: ContextRelationship;
    integration_modules: string[];
    current_problem?: string;
    recommendation: string;
    evidence: EvidenceItem[];
    linked_governance_actions?: string[];
  }>;
  aggregates: Array<{
    name: string;
    bounded_context: string;
    aggregate_root: {
      type_name: string;
      module_name: string;
      ref: string;
    };
    entities: string[];
    value_objects?: string[];
    invariants: string[];
    consistency_boundary_note: string;
    design_concerns?: string[];
    confidence: "high" | "medium" | "low";
    evidence: EvidenceItem[];
    linked_governance_actions?: string[];
  }>;
  modeling_gaps?: Array<{
    kind: ModelingGapKind;
    title: string;
    description: string;
    affected_contexts: string[];
    evidence: EvidenceItem[];
    linked_governance_actions?: string[];
  }>;
  strategy_notes?: string;
}

export interface ModuleDddProfile {
  bounded_context_membership: {
    context_name: string;
    role_in_context: "primary" | "secondary" | "integration";
    confidence: "high" | "medium" | "low";
  };
  aggregate_candidates: Array<{
    type_name: string;
    ref: string;
    role: "aggregate_root" | "entity" | "value_object" | "domain_service";
    rationale: string;
    evidence: EvidenceItem[];
  }>;
  boundary_recommendations: string[];
  anti_corruption_needed?: boolean;
  linked_governance_actions?: string[];
}

export interface AiReportContent {
  report_version?: "2.0" | "2.1";
  summary: string;
  architecture_overview?: ArchitectureOverviewFact;
  key_dependency_chains?: Array<{ path: string[]; reason: string; evidence: EvidenceItem[] }>;
  issue_interpretations?: IssueInterpretation[];
  module_roles?: ModuleRoleEntry[];
  module_intent?: ModuleIntentDetail;
  design_hypotheses?: DesignHypothesis[];
  strangler_roadmap?: StranglerRoadmapStep[];
  risks: Array<{
    title: string;
    severity: string;
    description: string;
    evidence_refs?: string[];
    evidence?: EvidenceItem[];
  }>;
  quick_wins: Array<{
    title: string;
    description: string;
    effort: "S" | "M" | "L";
    evidence_refs?: string[];
    evidence?: EvidenceItem[];
  }>;
  refactoring_recommendations: Array<{
    title: string;
    category: string;
    description: string;
    effort: "S" | "M" | "L";
    evidence_refs?: string[];
    evidence?: EvidenceItem[];
    module_name?: string;
  }>;
  strangler_candidates?: Array<{
    module_name: string;
    score: number;
    rationale: string;
    evidence_refs?: string[];
    evidence?: EvidenceItem[];
  }>;
  executive_summary?: ExecutiveSummary;
  governance_plan?: GovernancePlan;
  ddd_governance?: DddGovernance;
  module_ddd_profile?: ModuleDddProfile;
}
