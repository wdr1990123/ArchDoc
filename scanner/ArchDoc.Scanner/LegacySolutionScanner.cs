using System.Text.RegularExpressions;
using System.Xml.Linq;
using ArchDoc.Metrics;
using ArchDoc.Metrics.Models;

namespace ArchDoc.Scanner;

/// <summary>
/// Fallback for non-SDK / .NET Framework .csproj when MSBuildWorkspace fails.
/// Parses .sln + .csproj structure and counts LOC from source files.
/// </summary>
public static class LegacySolutionScanner
{
    private static readonly Regex SlnProjectLine = new(
        @"Project\(""[^""]+""\)\s*=\s*""([^""]+)"",\s*""([^""]+)"",",
        RegexOptions.Compiled);

    public static ScanResult Scan(string solutionPath, string repositoryId)
    {
        var solutionFull = Path.GetFullPath(solutionPath);
        var solutionDir = Path.GetDirectoryName(solutionFull)!;

        var projects = ParseSolutionProjects(solutionFull, solutionDir)
            .Where(p => p.CsprojPath.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (projects.Count == 0)
            throw new InvalidOperationException("Legacy parser: no C# projects found in solution file.");

        var result = new ScanResult
        {
            RepositoryId = repositoryId,
            SolutionPath = Path.GetFileName(solutionFull),
            ScannedAt = DateTime.UtcNow
        };

        var pathToModuleId = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var proj in projects)
        {
            var modId = $"mod-{GuidHash(proj.CsprojPath)}";
            pathToModuleId[NormalizePath(proj.CsprojPath)] = modId;

            var info = ReadProjectInfo(proj.CsprojPath);
            var loc = CountProjectLoc(proj.ProjectDir);

            result.Modules.Add(new ScanModule
            {
                Id = modId,
                Name = info.AssemblyName,
                Kind = "project",
                Loc = loc
            });

            foreach (var pkg in info.PackageReferences)
            {
                result.PackageRefs.Add(new ScanPackageRef
                {
                    ModuleId = modId,
                    PackageId = pkg.Name,
                    Version = pkg.Version
                });
            }

            var topTypes = FindTopTypeNames(proj.ProjectDir);
            if (topTypes.Count > 0)
            {
                result.Summaries.Add(new ScanSummary
                {
                    ModuleId = modId,
                    TopTypes = topTypes,
                    Snippet = $"// {info.AssemblyName}: {string.Join(", ", topTypes.Take(3))}"
                });
            }
        }

        foreach (var proj in projects)
        {
            if (!pathToModuleId.TryGetValue(NormalizePath(proj.CsprojPath), out var fromId))
                continue;

            var info = ReadProjectInfo(proj.CsprojPath);
            foreach (var refPath in info.ProjectReferences)
            {
                var resolved = Path.GetFullPath(Path.Combine(proj.ProjectDir, refPath));
                if (pathToModuleId.TryGetValue(NormalizePath(resolved), out var toId))
                {
                    result.Dependencies.Add(new ScanDependency
                    {
                        From = fromId,
                        To = toId,
                        Kind = "project_ref",
                        Weight = 1
                    });
                }
            }
        }

        result.Issues.Add(new ScanIssue
        {
            RuleId = "LEGACY-SCAN",
            Severity = "low",
            ModuleIds = result.Modules.Select(m => m.Id).ToList(),
            Message =
                "此 Solution 使用旧式 .NET Framework 项目格式，已启用兼容扫描（结构/依赖/行数）。部分 Roslyn 深度规则未运行。"
        });

        MetricsEngine.Compute(result);
        return result;
    }

    private static List<SlnProject> ParseSolutionProjects(string solutionPath, string solutionDir)
    {
        var text = File.ReadAllText(solutionPath);
        var list = new List<SlnProject>();

        foreach (Match match in SlnProjectLine.Matches(text))
        {
            var name = match.Groups[1].Value;
            var relative = match.Groups[2].Value.Replace('\\', Path.DirectorySeparatorChar);
            if (!relative.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase))
                continue;

            var csprojPath = Path.GetFullPath(Path.Combine(solutionDir, relative));
            if (!File.Exists(csprojPath))
                continue;

            list.Add(new SlnProject(name, csprojPath, Path.GetDirectoryName(csprojPath)!));
        }

        return list;
    }

    private static ProjectInfo ReadProjectInfo(string csprojPath)
    {
        var text = File.ReadAllText(csprojPath);
        var assemblyName = MatchSingle(text, @"<AssemblyName>([^<]+)</AssemblyName>")
            ?? MatchSingle(text, @"<RootNamespace>([^<]+)</RootNamespace>")
            ?? Path.GetFileNameWithoutExtension(csprojPath);

        var projectRefs = new List<string>();
        foreach (Match m in Regex.Matches(text, @"<ProjectReference\s+Include=""([^""]+)""", RegexOptions.IgnoreCase))
        {
            projectRefs.Add(m.Groups[1].Value.Replace('\\', Path.DirectorySeparatorChar));
        }

        var packages = ParsePackageReferences(text).ToList();
        return new ProjectInfo(assemblyName, projectRefs, packages);
    }

    private static IEnumerable<(string Name, string Version)> ParsePackageReferences(string csproj)
    {
        string? currentPackage = null;
        var version = "";

        foreach (var line in csproj.Split('\n'))
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

        // packages.config fallback
        var csprojDir = Path.GetDirectoryName(csproj)!;
        var packagesConfig = Path.Combine(csprojDir, "packages.config");
        if (File.Exists(packagesConfig))
        {
            foreach (var pkg in ReadPackagesConfig(packagesConfig))
                yield return pkg;
        }
    }

    private static List<(string Name, string Version)> ReadPackagesConfig(string path)
    {
        var list = new List<(string Name, string Version)>();
        try
        {
            var doc = XDocument.Load(path);
            foreach (var pkg in doc.Root?.Elements("package") ?? Enumerable.Empty<XElement>())
            {
                var id = pkg.Attribute("id")?.Value;
                var ver = pkg.Attribute("version")?.Value ?? "";
                if (!string.IsNullOrEmpty(id))
                    list.Add((id, ver));
            }
        }
        catch
        {
            /* ignore malformed packages.config */
        }

        return list;
    }

    private static int CountProjectLoc(string projectDir)
    {
        var total = 0;
        if (!Directory.Exists(projectDir))
            return 0;

        foreach (var file in Directory.EnumerateFiles(projectDir, "*.cs", SearchOption.AllDirectories))
        {
            if (IsExcludedSourcePath(file))
                continue;
            try
            {
                total += File.ReadLines(file).Count();
            }
            catch
            {
                /* skip unreadable */
            }
        }

        return total;
    }

    private static bool IsExcludedSourcePath(string path)
    {
        var parts = path.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return parts.Any(p =>
            p.Equals("bin", StringComparison.OrdinalIgnoreCase) ||
            p.Equals("obj", StringComparison.OrdinalIgnoreCase) ||
            p.Equals("packages", StringComparison.OrdinalIgnoreCase));
    }

    private static List<string> FindTopTypeNames(string projectDir)
    {
        var names = new List<string>();
        if (!Directory.Exists(projectDir))
            return names;

        var classDecl = new Regex(@"\bclass\s+(\w+)", RegexOptions.Compiled);
        foreach (var file in Directory.EnumerateFiles(projectDir, "*.cs", SearchOption.AllDirectories))
        {
            if (IsExcludedSourcePath(file))
                continue;
            if (names.Count >= 5)
                break;
            try
            {
                var text = File.ReadAllText(file);
                foreach (Match m in classDecl.Matches(text))
                {
                    names.Add(m.Groups[1].Value);
                    if (names.Count >= 5)
                        break;
                }
            }
            catch
            {
                /* skip */
            }
        }

        return names;
    }

    private static string? MatchSingle(string text, string pattern) =>
        Regex.Match(text, pattern, RegexOptions.IgnoreCase).Success
            ? Regex.Match(text, pattern, RegexOptions.IgnoreCase).Groups[1].Value.Trim()
            : null;

    private static string NormalizePath(string path) =>
        Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

    private static string GuidHash(string input)
    {
        var hash = System.Security.Cryptography.MD5.HashData(System.Text.Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash)[..12].ToLowerInvariant();
    }

    private sealed record SlnProject(string Name, string CsprojPath, string ProjectDir);

    private sealed record ProjectInfo(
        string AssemblyName,
        List<string> ProjectReferences,
        List<(string Name, string Version)> PackageReferences);
}
