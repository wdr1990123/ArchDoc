namespace ArchDoc.Metrics.Models;

public sealed class ScanResult
{
    public string SchemaVersion { get; set; } = "1.0";
    public string RepositoryId { get; set; } = "";
    public string SolutionPath { get; set; } = "";
    public DateTime ScannedAt { get; set; } = DateTime.UtcNow;
    public string? CommitSha { get; set; }
    public List<ScanModule> Modules { get; set; } = new();
    public List<ScanDependency> Dependencies { get; set; } = new();
    public List<ScanPackageRef> PackageRefs { get; set; } = new();
    public List<ScanMetric> Metrics { get; set; } = new();
    public List<ScanIssue> Issues { get; set; } = new();
    public List<ScanSummary> Summaries { get; set; } = new();
}

public sealed class ScanModule
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "project";
    public int Loc { get; set; }
    public string? Layer { get; set; }
}

public sealed class ScanDependency
{
    public string From { get; set; } = "";
    public string To { get; set; } = "";
    public string Kind { get; set; } = "project_ref";
    public int Weight { get; set; } = 1;
}

public sealed class ScanPackageRef
{
    public string ModuleId { get; set; } = "";
    public string PackageId { get; set; } = "";
    public string Version { get; set; } = "";
}

public sealed class ScanMetric
{
    public string ModuleId { get; set; } = "";
    public string Code { get; set; } = "";
    public double Value { get; set; }
}

public sealed class ScanIssue
{
    public string RuleId { get; set; } = "";
    public string Severity { get; set; } = "medium";
    public List<string> ModuleIds { get; set; } = new();
    public string Message { get; set; } = "";
    public Dictionary<string, object>? Location { get; set; }
}

public sealed class ScanSummary
{
    public string ModuleId { get; set; } = "";
    public List<string> TopTypes { get; set; } = new();
    public string Snippet { get; set; } = "";
}
