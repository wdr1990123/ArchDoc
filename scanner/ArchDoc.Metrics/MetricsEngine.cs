using ArchDoc.Metrics.Models;

namespace ArchDoc.Metrics;

public static class MetricsEngine
{
    public static void Compute(ScanResult result)
    {
        var adjacency = result.Dependencies
            .GroupBy(d => d.From)
            .ToDictionary(g => g.Key, g => g.Select(x => x.To).Distinct().ToList());

        var reverse = result.Dependencies
            .GroupBy(d => d.To)
            .ToDictionary(g => g.Key, g => g.Select(x => x.From).Distinct().ToList());

        foreach (var mod in result.Modules)
        {
            var ce = adjacency.GetValueOrDefault(mod.Id)?.Count ?? 0;
            var ca = reverse.GetValueOrDefault(mod.Id)?.Count ?? 0;
            var instability = ce + ca == 0 ? 0 : (double)ce / (ce + ca);

            result.Metrics.Add(new ScanMetric { ModuleId = mod.Id, Code = "M01", Value = ce });
            result.Metrics.Add(new ScanMetric { ModuleId = mod.Id, Code = "M02", Value = ca });
            result.Metrics.Add(new ScanMetric { ModuleId = mod.Id, Code = "M03", Value = instability });
        }

        DetectCycles(result, adjacency);
        DetectLayerViolations(result);
        DetectHighFanout(result);
    }

    public static void DetectHighFanout(ScanResult result)
    {
        var outgoing = result.Dependencies
            .GroupBy(d => d.From)
            .ToDictionary(g => g.Key, g => g.Count());

        foreach (var mod in result.Modules)
        {
            var fanout = outgoing.GetValueOrDefault(mod.Id);
            if (fanout >= 5)
            {
                result.Metrics.Add(new ScanMetric { ModuleId = mod.Id, Code = "M06", Value = fanout });
            }
            if (fanout >= 8)
            {
                result.Issues.Add(new ScanIssue
                {
                    RuleId = "HIGH_FANOUT",
                    Severity = fanout >= 12 ? "high" : "medium",
                    ModuleIds = [mod.Id],
                    Message = $"High fan-out: {mod.Name} depends on {fanout} modules"
                });
            }
        }
    }

    private static void DetectCycles(ScanResult result, Dictionary<string, List<string>> adjacency)
    {
        var index = new Dictionary<string, int>();
        var lowlink = new Dictionary<string, int>();
        var onStack = new HashSet<string>();
        var stack = new Stack<string>();
        var sccList = new List<List<string>>();
        var current = 0;

        void StrongConnect(string v)
        {
            index[v] = current;
            lowlink[v] = current;
            current++;
            stack.Push(v);
            onStack.Add(v);

            foreach (var w in adjacency.GetValueOrDefault(v) ?? [])
            {
                if (!index.ContainsKey(w))
                {
                    StrongConnect(w);
                    lowlink[v] = Math.Min(lowlink[v], lowlink[w]);
                }
                else if (onStack.Contains(w))
                {
                    lowlink[v] = Math.Min(lowlink[v], index[w]);
                }
            }

            if (lowlink[v] == index[v])
            {
                var scc = new List<string>();
                string w;
                do
                {
                    w = stack.Pop();
                    onStack.Remove(w);
                    scc.Add(w);
                } while (w != v);

                if (scc.Count > 1)
                    sccList.Add(scc);
            }
        }

        foreach (var mod in result.Modules)
        {
            if (!index.ContainsKey(mod.Id))
                StrongConnect(mod.Id);
        }

        foreach (var scc in sccList)
        {
            var names = scc.Select(id => result.Modules.First(m => m.Id == id).Name);
            result.Issues.Add(new ScanIssue
            {
                RuleId = "CYCLE_SCC",
                Severity = "critical",
                ModuleIds = scc,
                Message = $"Circular dependency detected: {string.Join(" -> ", names)}"
            });

            foreach (var modId in scc)
            {
                result.Metrics.Add(new ScanMetric { ModuleId = modId, Code = "M04", Value = 1 });
            }
        }
    }

    private static void DetectLayerViolations(ScanResult result)
    {
        var moduleMap = result.Modules.ToDictionary(m => m.Id);
        var allowed = LayerRules.LoadDefault();

        foreach (var dep in result.Dependencies)
        {
            if (!moduleMap.TryGetValue(dep.From, out var fromMod) ||
                !moduleMap.TryGetValue(dep.To, out var toMod))
                continue;

            var fromLayer = InferLayer(fromMod);
            var toLayer = InferLayer(toMod);
            if (fromLayer == null || toLayer == null) continue;

            if (!allowed.IsAllowed(fromLayer, toLayer))
            {
                result.Issues.Add(new ScanIssue
                {
                    RuleId = "LAYER_VIOLATION",
                    Severity = "high",
                    ModuleIds = [dep.From, dep.To],
                    Message = $"Layer violation: {fromMod.Name} ({fromLayer}) -> {toMod.Name} ({toLayer})"
                });
                result.Metrics.Add(new ScanMetric { ModuleId = dep.From, Code = "M05", Value = 1 });
            }
        }
    }

    private static string? InferLayer(ScanModule mod)
    {
        if (!string.IsNullOrEmpty(mod.Layer)) return mod.Layer;
        var name = mod.Name.ToLowerInvariant();
        if (name.Contains(".web") || name.Contains(".ui") || name.Contains(".api")) return "ui";
        if (name.Contains(".bll") || name.Contains(".service")) return "bll";
        if (name.Contains(".dal") || name.Contains(".data") || name.Contains(".repository")) return "dal";
        if (name.Contains(".common") || name.Contains(".shared")) return "common";
        return null;
    }
}
