using System.Net.Http.Headers;
using System.Text;
using ArchDoc.Metrics.Models;
using ArchDoc.Scanner;

var argsMap = ParseArgs(args);

if (!argsMap.TryGetValue("solution", out var solution) || string.IsNullOrWhiteSpace(solution))
{
    PrintUsage();
    return 1;
}

if (!argsMap.TryGetValue("repository-id", out var repositoryId) || string.IsNullOrWhiteSpace(repositoryId))
{
    Console.Error.WriteLine("Error: --repository-id is required");
    return 1;
}

if (!File.Exists(solution))
{
    Console.Error.WriteLine($"Error: Solution not found: {solution}");
    return 1;
}

var scanner = new SolutionScanner();
Console.WriteLine($"Scanning {solution}...");

ScanResult result;
try
{
    result = await scanner.ScanAsync(Path.GetFullPath(solution), repositoryId);
}
catch (Exception ex)
{
    Console.Error.WriteLine($"Scan failed: {ex.Message}");
    return 1;
}

var json = scanner.Serialize(result);
Console.WriteLine($"Scan complete: {result.Modules.Count} modules, {result.Dependencies.Count} dependencies, {result.Issues.Count} issues");

if (argsMap.TryGetValue("output", out var outputPath) && !string.IsNullOrWhiteSpace(outputPath))
{
    await File.WriteAllTextAsync(outputPath, json, Encoding.UTF8);
    Console.WriteLine($"Written to {outputPath}");
}

var noUpload = argsMap.ContainsKey("no-upload");
if (!noUpload && argsMap.TryGetValue("api-url", out var apiUrl) && !string.IsNullOrWhiteSpace(apiUrl))
{
    argsMap.TryGetValue("api-key", out var apiKey);
    var uploadUrl = apiUrl.TrimEnd('/') + "/scans/upload";
    using var client = new HttpClient();
    if (!string.IsNullOrEmpty(apiKey))
        client.DefaultRequestHeaders.Add("X-Api-Key", apiKey);

    var content = new StringContent(json, Encoding.UTF8, "application/json");
    var response = await client.PostAsync(uploadUrl, content);
    var body = await response.Content.ReadAsStringAsync();

    if (!response.IsSuccessStatusCode)
    {
        Console.Error.WriteLine($"Upload failed ({response.StatusCode}): {body}");
        return 1;
    }

    Console.WriteLine($"Uploaded: {body}");
}

return 0;

static Dictionary<string, string> ParseArgs(string[] args)
{
    var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    for (var i = 0; i < args.Length; i++)
    {
        if (!args[i].StartsWith("--")) continue;
        var key = args[i][2..];
        if (i + 1 < args.Length && !args[i + 1].StartsWith("--"))
        {
            map[key] = args[i + 1];
            i++;
        }
        else
        {
            map[key] = "true";
        }
    }
    return map;
}

static void PrintUsage()
{
    Console.WriteLine("""
        ArchDoc Scanner CLI

        Usage:
          archdoc-scan --solution <path.sln> --repository-id <uuid> [options]

        Options:
          --api-url       ArchDoc API base URL (e.g. http://localhost:3000/api/v1)
          --api-key       API key for upload
          --output        Write scan-result.json locally
          --no-upload     Skip upload even if api-url is set
        """);
}
