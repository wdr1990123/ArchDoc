namespace ArchDoc.Metrics;

public sealed class LayerRules
{
    public List<string> Layers { get; set; } = [];
    public List<LayerAllowRule> Allowed { get; set; } = [];

    public bool IsAllowed(string fromLayer, string toLayer)
    {
        if (fromLayer == toLayer) return true;
        var rule = Allowed.FirstOrDefault(r => r.From == fromLayer);
        if (rule == null) return true;
        return rule.To.Contains(toLayer);
    }

    public static LayerRules LoadDefault()
    {
        return new LayerRules
        {
            Layers = ["ui", "bll", "dal", "common"],
            Allowed =
            [
                new LayerAllowRule { From = "ui", To = ["bll", "common"] },
                new LayerAllowRule { From = "bll", To = ["dal", "common"] },
                new LayerAllowRule { From = "dal", To = ["common"] },
                new LayerAllowRule { From = "common", To = [] },
            ]
        };
    }
}

public sealed class LayerAllowRule
{
    public string From { get; set; } = "";
    public List<string> To { get; set; } = [];
}
