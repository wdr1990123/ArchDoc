using ArchDoc.Metrics.Models;

namespace ArchDoc.Scanner;

/// <summary>
/// Builds structured module summaries from PublicSurface after deep analysis.
/// </summary>
public static class SummaryEnricher
{
    private static readonly (string Suffix, string Label)[] RoleSuffixes =
    [
        ("Controller", "Controller"),
        ("Service", "Service"),
        ("Repository", "Repository"),
        ("Repo", "Repository"),
        ("Manager", "Manager"),
        ("Handler", "Handler"),
        ("Provider", "Provider"),
        ("Factory", "Factory"),
        ("Dto", "Dto"),
        ("DTO", "Dto"),
        ("Entity", "Entity"),
        ("Model", "Model"),
        ("ViewModel", "ViewModel"),
        ("Mapper", "Mapper"),
        ("Validator", "Validator"),
    ];

    public static void EnrichSummaries(ScanResult result)
    {
        if (result.PublicSurface.Count == 0) return;

        var moduleById = result.Modules.ToDictionary(m => m.Id);
        var existing = result.Summaries.ToDictionary(s => s.ModuleId);
        var byModule = result.PublicSurface.GroupBy(p => p.ModuleId);

        foreach (var group in byModule)
        {
            if (!moduleById.TryGetValue(group.Key, out var mod)) continue;

            var types = group.ToList();
            var roleCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var roleHints = new List<string>();
            var topTypes = new List<string>();

            foreach (var pt in types.OrderByDescending(t => t.Members.Count).Take(8))
            {
                var shortName = pt.TypeName.Contains('.')
                    ? pt.TypeName.Split('.').Last()
                    : pt.TypeName;
                if (!topTypes.Contains(shortName))
                    topTypes.Add(shortName);

                var role = ClassifyRole(shortName, pt.Kind);
                if (role != null)
                {
                    roleCounts[role] = roleCounts.GetValueOrDefault(role) + 1;
                    if (!roleHints.Contains(role))
                        roleHints.Add(role);
                }
            }

            var countParts = roleCounts
                .OrderByDescending(kv => kv.Value)
                .Select(kv => $"{kv.Value} 个 {kv.Key}")
                .Take(4)
                .ToList();

            var entryPoint = types
                .Where(t => t.Members.Count > 0)
                .OrderByDescending(t => t.Members.Count)
                .Select(t =>
                {
                    var name = t.TypeName.Contains('.')
                        ? t.TypeName.Split('.').Last()
                        : t.TypeName;
                    return $"{name}.{t.Members[0]}";
                })
                .FirstOrDefault();

            var snippetParts = new List<string>();
            if (countParts.Count > 0)
                snippetParts.Add(string.Join("、", countParts));
            else
                snippetParts.Add($"{types.Count} 个 public 类型");
            if (entryPoint != null)
                snippetParts.Add($"入口：{entryPoint}");

            var summary = new ScanSummary
            {
                ModuleId = group.Key,
                TopTypes = topTypes.Take(5).ToList(),
                Snippet = $"{mod.Name}: {string.Join("；", snippetParts)}",
                RoleHints = roleHints.Take(6).ToList(),
            };

            if (existing.ContainsKey(group.Key))
            {
                var idx = result.Summaries.FindIndex(s => s.ModuleId == group.Key);
                result.Summaries[idx] = summary;
            }
            else
            {
                result.Summaries.Add(summary);
            }
        }
    }

    private static string? ClassifyRole(string typeName, string kind)
    {
        foreach (var (suffix, label) in RoleSuffixes)
        {
            if (typeName.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                return label;
        }

        if (kind.Equals("interface", StringComparison.OrdinalIgnoreCase))
            return "Interface";

        return null;
    }
}
