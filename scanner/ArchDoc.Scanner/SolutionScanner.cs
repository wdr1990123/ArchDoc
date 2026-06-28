using System.Text.Json;
using System.Text.Json.Serialization;
using ArchDoc.Metrics;
using ArchDoc.Metrics.Models;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.MSBuild;

namespace ArchDoc.Scanner;

public sealed class SolutionScanner
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true
    };

    public async Task<ScanResult> ScanAsync(string solutionPath, string repositoryId, CancellationToken ct = default)
    {
        MSBuildLocator.RegisterDefaults();

        using var workspace = MSBuildWorkspace.Create();
        var solution = await workspace.OpenSolutionAsync(solutionPath, cancellationToken: ct);

        var result = new ScanResult
        {
            RepositoryId = repositoryId,
            SolutionPath = Path.GetFileName(solutionPath),
            ScannedAt = DateTime.UtcNow
        };

        var projectIdMap = new Dictionary<string, string>();

        foreach (var project in solution.Projects.Where(p => p.Language == LanguageNames.CSharp))
        {
            var projectKey = project.Id.Id.ToString();
            var modId = $"mod-{projectKey}";
            projectIdMap[projectKey] = modId;

            var loc = 0;
            var topTypes = new List<string>();
            foreach (var doc in project.Documents)
            {
                if (doc.FilePath == null) continue;
                var text = await doc.GetTextAsync(ct);
                loc += text.Lines.Count;
            }

            var compilation = await project.GetCompilationAsync(ct);
            if (compilation != null)
            {
                foreach (var tree in compilation.SyntaxTrees)
                {
                    var root = await tree.GetRootAsync(ct);
                    var classes = root.DescendantNodes().OfType<ClassDeclarationSyntax>().Take(5);
                    foreach (var cls in classes)
                    {
                        if (cls.Identifier.Text.Length > 0)
                            topTypes.Add(cls.Identifier.Text);
                    }
                }
            }

            result.Modules.Add(new ScanModule
            {
                Id = modId,
                Name = project.AssemblyName,
                Kind = "project",
                Loc = loc
            });

            if (topTypes.Count > 0)
            {
                result.Summaries.Add(new ScanSummary
                {
                    ModuleId = modId,
                    TopTypes = topTypes.Take(5).ToList(),
                    Snippet = $"// {project.AssemblyName}: {string.Join(", ", topTypes.Take(3))}"
                });
            }
        }

        foreach (var project in solution.Projects.Where(p => p.Language == LanguageNames.CSharp))
        {
            var fromId = projectIdMap[project.Id.Id.ToString()];

            foreach (var reference in project.ProjectReferences)
            {
                if (!projectIdMap.TryGetValue(reference.ProjectId.Id.ToString(), out var toId)) continue;
                result.Dependencies.Add(new ScanDependency
                {
                    From = fromId,
                    To = toId,
                    Kind = "project_ref",
                    Weight = 1
                });
            }

            var compilation = await project.GetCompilationAsync(ct);
            if (compilation != null)
            {
                foreach (var doc in project.Documents)
                {
                    var tree = await doc.GetSyntaxTreeAsync(ct);
                    if (tree == null) continue;
                    var root = await tree.GetRootAsync(ct);
                    var refs = root.DescendantNodes()
                        .OfType<UsingDirectiveSyntax>()
                        .Select(u => u.Name?.ToString())
                        .Where(n => !string.IsNullOrEmpty(n));

                    foreach (var ns in refs.Take(20))
                    {
                        _ = ns;
                    }
                }
            }

            if (project.FilePath != null)
            {
                var csprojDir = Path.GetDirectoryName(project.FilePath)!;
                var csprojText = await File.ReadAllTextAsync(project.FilePath, ct);
                foreach (var pkg in ParsePackageReferences(csprojText))
                {
                    result.PackageRefs.Add(new ScanPackageRef
                    {
                        ModuleId = fromId,
                        PackageId = pkg.Name,
                        Version = pkg.Version
                    });
                }
            }
        }

        MetricsEngine.Compute(result);
        return result;
    }

    public string Serialize(ScanResult result) =>
        JsonSerializer.Serialize(result, JsonOptions);

    private static IEnumerable<(string Name, string Version)> ParsePackageReferences(string csproj)
    {
        var lines = csproj.Split('\n');
        string? currentPackage = null;
        string version = "";

        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            if (trimmed.StartsWith("<PackageReference Include=\"", StringComparison.Ordinal))
            {
                var start = trimmed.IndexOf('"') + 1;
                var end = trimmed.IndexOf('"', start);
                currentPackage = trimmed[start..end];

                if (trimmed.Contains("Version=\""))
                {
                    var vStart = trimmed.IndexOf("Version=\"") + 8;
                    var vEnd = trimmed.IndexOf('"', vStart);
                    version = trimmed[vStart..vEnd];
                    yield return (currentPackage, version);
                    currentPackage = null;
                }
            }
            else if (currentPackage != null && trimmed.StartsWith("<Version>", StringComparison.Ordinal))
            {
                version = trimmed.Replace("<Version>", "").Replace("</Version>", "").Trim();
                yield return (currentPackage, version);
                currentPackage = null;
            }
            else if (trimmed.StartsWith("</PackageReference>", StringComparison.Ordinal))
            {
                if (currentPackage != null)
                    yield return (currentPackage, version);
                currentPackage = null;
            }
        }
    }
}

internal static class MSBuildLocator
{
    private static bool _registered;

    public static void RegisterDefaults()
    {
        if (_registered) return;
        Microsoft.Build.Locator.MSBuildLocator.RegisterDefaults();
        _registered = true;
    }
}
