using System.Text;
using System.Text.Json;
using ArchDoc.Metrics.Models;
using ArchDoc.Scanner;

var argsMap = ParseArgs(args);

if (!argsMap.TryGetValue("solution", out var solution) || string.IsNullOrWhiteSpace(solution))
{
    PrintUsage();
    return 1;
}

if (!File.Exists(solution))
{
    Console.Error.WriteLine($"Error: Solution not found: {solution}");
    return 1;
}

argsMap.TryGetValue("api-url", out var apiUrl);
argsMap.TryGetValue("api-key", out var apiKey);
var noUpload = argsMap.ContainsKey("no-upload");
var runDiagnose = argsMap.ContainsKey("diagnose");

string? repositoryId = null;
if (argsMap.TryGetValue("repository-id", out var repoIdArg) && !string.IsNullOrWhiteSpace(repoIdArg))
{
    repositoryId = repoIdArg;
}
else if (
    argsMap.TryGetValue("domain-id", out var domainId) &&
    argsMap.TryGetValue("repo-name", out var repoName) &&
    !string.IsNullOrWhiteSpace(domainId) &&
    !string.IsNullOrWhiteSpace(repoName))
{
    if (string.IsNullOrWhiteSpace(apiUrl))
    {
        Console.Error.WriteLine("Error: --api-url is required when using --domain-id and --repo-name");
        return 1;
    }

    try
    {
        repositoryId = await RegisterRepositoryAsync(
            apiUrl,
            apiKey,
            domainId,
            repoName,
            Path.GetFullPath(solution));
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Failed to register repository: {ex.Message}");
        return 1;
    }

    Console.WriteLine($"Repository registered: {repositoryId}");
}
else
{
    Console.Error.WriteLine("Error: specify --repository-id or (--domain-id and --repo-name)");
    PrintUsage();
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

string? scanRunId = null;

if (!noUpload && !string.IsNullOrWhiteSpace(apiUrl))
{
    try
    {
        scanRunId = await UploadScanAsync(apiUrl, apiKey, json);
        Console.WriteLine($"Uploaded: {{\"scan_run_id\":\"{scanRunId}\"}}");
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Upload failed: {ex.Message}");
        return 1;
    }
}

if (runDiagnose && !string.IsNullOrWhiteSpace(scanRunId) && !string.IsNullOrWhiteSpace(apiUrl))
{
    try
    {
        var reportId = await TriggerDiagnoseAsync(apiUrl, apiKey, scanRunId);
        if (!string.IsNullOrEmpty(reportId))
            Console.WriteLine($"Diagnosis report: {reportId}");
        else
            Console.WriteLine("Diagnosis job enqueued (report pending)");
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Diagnosis failed: {ex.Message}");
        return 1;
    }
}

return 0;

static async Task<string> RegisterRepositoryAsync(
    string apiUrl,
    string? apiKey,
    string domainId,
    string repoName,
    string solutionPath)
{
    using var client = CreateApiClient(apiKey);
    var payload = JsonSerializer.Serialize(new
    {
        domain_id = domainId,
        name = repoName,
        source_type = "local",
        solution_path = solutionPath,
    });

    var response = await client.PostAsync(
        $"{apiUrl.TrimEnd('/')}/repositories",
        new StringContent(payload, Encoding.UTF8, "application/json"));

    var body = await response.Content.ReadAsStringAsync();
    if (!response.IsSuccessStatusCode)
        throw new Exception($"HTTP {(int)response.StatusCode}: {body}");

    using var doc = JsonDocument.Parse(body);
    var id = doc.RootElement.GetProperty("repository").GetProperty("id").GetString();
    if (string.IsNullOrWhiteSpace(id))
        throw new Exception("repository id missing in response");
    return id;
}

static async Task<string> UploadScanAsync(string apiUrl, string? apiKey, string json)
{
    using var client = CreateApiClient(apiKey);
    var response = await client.PostAsync(
        $"{apiUrl.TrimEnd('/')}/scans/upload",
        new StringContent(json, Encoding.UTF8, "application/json"));

    var body = await response.Content.ReadAsStringAsync();
    if (!response.IsSuccessStatusCode)
        throw new Exception($"HTTP {(int)response.StatusCode}: {body}");

    using var doc = JsonDocument.Parse(body);
    var id = doc.RootElement.GetProperty("scan_run_id").GetString();
    if (string.IsNullOrWhiteSpace(id))
        throw new Exception("scan_run_id missing in response");
    return id;
}

static async Task<string?> TriggerDiagnoseAsync(string apiUrl, string? apiKey, string scanRunId)
{
    using var client = CreateApiClient(apiKey);
    var response = await client.PostAsync(
        $"{apiUrl.TrimEnd('/')}/scans/{scanRunId}/diagnose",
        new StringContent("{}", Encoding.UTF8, "application/json"));

    var body = await response.Content.ReadAsStringAsync();
    if (!response.IsSuccessStatusCode)
        throw new Exception($"HTTP {(int)response.StatusCode}: {body}");

    using var doc = JsonDocument.Parse(body);
    if (doc.RootElement.TryGetProperty("report_id", out var reportProp))
    {
        return reportProp.GetString();
    }

    return null;
}

static HttpClient CreateApiClient(string? apiKey)
{
    var client = new HttpClient();
    if (!string.IsNullOrEmpty(apiKey))
        client.DefaultRequestHeaders.Add("X-Api-Key", apiKey);
    return client;
}

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
          archdoc-scan --solution <path.sln> (--repository-id <uuid> | --domain-id <uuid> --repo-name <name>) [options]

        Options:
          --api-url       ArchDoc API base URL (e.g. http://localhost:3000/api/v1)
          --api-key       API key for upload / register
          --domain-id     Register repo under this diagnosis domain (with --repo-name)
          --repo-name     Repository name when auto-registering
          --output        Write scan-result.json locally
          --no-upload     Skip upload even if api-url is set
          --diagnose      Trigger AI diagnosis after successful upload
        """);
}
