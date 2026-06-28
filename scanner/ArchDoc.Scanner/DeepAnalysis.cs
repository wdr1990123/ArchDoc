using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ArchDoc.Metrics;
using ArchDoc.Metrics.Models;

namespace ArchDoc.Scanner;

/// <summary>
/// Roslyn deep read: namespaces, public API surface, cross-project type refs, code smell issues.
/// </summary>
public static class DeepAnalysis
{
    private const int GodClassLocThreshold = 400;
    private const int GodClassMethodThreshold = 20;
    private const int HighFanoutThreshold = 15;

    public static void Enrich(
        ScanResult result,
        Solution solution,
        IReadOnlyDictionary<string, string> projectIdMap,
        CancellationToken ct = default)
    {
        var moduleById = result.Modules.ToDictionary(m => m.Id);
        var projectByModId = projectIdMap.ToDictionary(kv => kv.Value, kv => kv.Key);

        foreach (var project in solution.Projects.Where(p => p.Language == LanguageNames.CSharp))
        {
            if (!projectIdMap.TryGetValue(project.Id.Id.ToString(), out var modId)) continue;
            if (!moduleById.TryGetValue(modId, out var mod)) continue;

            var compilation = project.GetCompilationAsync(ct).GetAwaiter().GetResult();
            if (compilation == null) continue;

            InferLayerFromPaths(mod, project.FilePath);

            var nsCounts = new Dictionary<string, int>(StringComparer.Ordinal);
            var folders = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var doc in project.Documents)
            {
                if (doc.FilePath != null)
                {
                    var rel = Path.GetRelativePath(
                        Path.GetDirectoryName(project.FilePath!)!,
                        doc.FilePath);
                    var top = rel.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)[0];
                    if (!string.IsNullOrEmpty(top) && !top.EndsWith(".cs", StringComparison.OrdinalIgnoreCase))
                        folders.Add(top);
                }

                var tree = doc.GetSyntaxTreeAsync(ct).GetAwaiter().GetResult();
                if (tree == null) continue;
                var model = compilation.GetSemanticModel(tree);
                var root = tree.GetRootAsync(ct).GetAwaiter().GetResult();

                foreach (var typeDecl in root.DescendantNodes().OfType<BaseTypeDeclarationSyntax>())
                {
                    if (model.GetDeclaredSymbol(typeDecl, ct) is not INamedTypeSymbol symbol) continue;

                    var ns = symbol.ContainingNamespace?.ToDisplayString() ?? "";
                    if (!string.IsNullOrEmpty(ns))
                        nsCounts[ns] = nsCounts.GetValueOrDefault(ns) + 1;

                    if (symbol.DeclaredAccessibility != Accessibility.Public) continue;

                    var members = symbol.GetMembers()
                        .OfType<IMethodSymbol>()
                        .Where(m => m.DeclaredAccessibility == Accessibility.Public && !m.IsImplicitlyDeclared)
                        .Select(m => $"{m.Name}({string.Join(", ", m.Parameters.Select(p => p.Type.Name))})")
                        .Take(12)
                        .ToList();

                    result.PublicSurface.Add(new ScanPublicType
                    {
                        ModuleId = modId,
                        TypeName = symbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
                        Kind = symbol.TypeKind.ToString().ToLowerInvariant(),
                        Members = members
                    });
                }
            }

            foreach (var (ns, count) in nsCounts.OrderByDescending(x => x.Value).Take(12))
            {
                result.Namespaces.Add(new ScanNamespaceEntry
                {
                    ModuleId = modId,
                    Name = ns,
                    TypeCount = count
                });
            }

            if (folders.Count > 0)
            {
                result.FolderLayout.Add(new ScanFolderLayout
                {
                    ModuleId = modId,
                    Folders = folders.OrderBy(f => f).Take(15).ToList()
                });
            }

            DetectGodClasses(result, modId, mod.Name, compilation, ct);
        }

        DetectCrossProjectTypeDependencies(result, solution, projectIdMap, ct);
        MetricsEngine.DetectHighFanout(result);
    }

    private static void InferLayerFromPaths(ScanModule mod, string? projectPath)
    {
        if (!string.IsNullOrEmpty(mod.Layer)) return;
        mod.Layer = InferLayerFromName(mod.Name);
        if (mod.Layer != null || projectPath == null) return;

        var dir = Path.GetDirectoryName(projectPath);
        if (dir == null) return;
        foreach (var segment in dir.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar))
        {
            var layer = InferLayerFromName(segment);
            if (layer != null)
            {
                mod.Layer = layer;
                return;
            }
        }
    }

    private static string? InferLayerFromName(string name)
    {
        var lower = name.ToLowerInvariant();
        if (lower.Contains(".web") || lower.Contains(".ui") || lower.Contains(".api") || lower == "api")
            return "ui";
        if (lower.Contains(".bll") || lower.Contains(".service") || lower.Contains("business"))
            return "bll";
        if (lower.Contains(".dal") || lower.Contains(".data") || lower.Contains(".repository"))
            return "dal";
        if (lower.Contains(".common") || lower.Contains(".shared") || lower.Contains(".core"))
            return "common";
        return null;
    }

    private static void DetectGodClasses(
        ScanResult result,
        string modId,
        string modName,
        Compilation compilation,
        CancellationToken ct)
    {
        foreach (var tree in compilation.SyntaxTrees)
        {
            var model = compilation.GetSemanticModel(tree);
            var root = tree.GetRootAsync(ct).GetAwaiter().GetResult();
            var text = tree.GetText();
            foreach (var cls in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
            {
                var symbol = model.GetDeclaredSymbol(cls, ct) as INamedTypeSymbol;
                if (symbol == null) continue;

                var startLine = text.Lines.GetLineFromPosition(cls.SpanStart).LineNumber;
                var endLine = text.Lines.GetLineFromPosition(cls.Span.End).LineNumber;
                var approxLoc = endLine - startLine + 1;
                var methods = symbol.GetMembers().OfType<IMethodSymbol>().Count(m => !m.IsImplicitlyDeclared);

                if (approxLoc >= GodClassLocThreshold || methods >= GodClassMethodThreshold)
                {
                    result.Issues.Add(new ScanIssue
                    {
                        RuleId = "GOD_CLASS",
                        Severity = approxLoc >= 800 ? "high" : "medium",
                        ModuleIds = [modId],
                        Message = $"God Class 嫌疑：{symbol.Name}（约 {approxLoc} LOC，{methods} 方法）于 {modName}"
                    });
                }
            }
        }
    }

    private static void DetectCrossProjectTypeDependencies(
        ScanResult result,
        Solution solution,
        IReadOnlyDictionary<string, string> projectIdMap,
        CancellationToken ct)
    {
        var counts = new Dictionary<(string From, string To, string FromType, string ToType), int>();

        foreach (var project in solution.Projects.Where(p => p.Language == LanguageNames.CSharp))
        {
            if (!projectIdMap.TryGetValue(project.Id.Id.ToString(), out var fromModId)) continue;
            var compilation = project.GetCompilationAsync(ct).GetAwaiter().GetResult();
            if (compilation == null) continue;

            foreach (var tree in compilation.SyntaxTrees)
            {
                var model = compilation.GetSemanticModel(tree);
                var root = tree.GetRootAsync(ct).GetAwaiter().GetResult();

                foreach (var node in root.DescendantNodes().OfType<IdentifierNameSyntax>())
                {
                    var symbol = model.GetSymbolInfo(node, ct).Symbol;
                    if (symbol?.ContainingType == null) continue;
                    var containingProject = symbol.ContainingModule?.ContainingAssembly?.Name;
                    if (containingProject == null || containingProject == project.AssemblyName) continue;

                    var toProject = solution.Projects.FirstOrDefault(p =>
                        p.AssemblyName == containingProject || p.Name == containingProject);
                    if (toProject == null) continue;
                    if (!projectIdMap.TryGetValue(toProject.Id.Id.ToString(), out var toModId)) continue;
                    if (fromModId == toModId) continue;

                    var fromType = symbol.ContainingType.ContainingType != null
                        ? symbol.ContainingType.ToDisplayString()
                        : symbol.ContainingType.Name;
                    var key = (fromModId, toModId, fromType, symbol.ContainingType.Name);
                    counts[key] = counts.GetValueOrDefault(key) + 1;
                }
            }
        }

        foreach (var ((from, to, fromType, toType), count) in counts.OrderByDescending(x => x.Value).Take(40))
        {
            result.TypeDependencies.Add(new ScanTypeDependency
            {
                FromModuleId = from,
                ToModuleId = to,
                FromType = fromType,
                ToType = toType,
                Count = count
            });
        }
    }
}
