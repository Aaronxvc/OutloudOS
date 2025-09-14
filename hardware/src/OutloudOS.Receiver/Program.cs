using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using OutloudOS.Receiver.Hubs;
using OutloudOS.Receiver;


// ---------- helpers ----------
static async Task<string?> ReadParamAsync(HttpRequest req, string name)
{
    if (req.HasFormContentType)
    {
        var form = await req.ReadFormAsync();
        if (form.TryGetValue(name, out var v) && !string.IsNullOrEmpty(v)) return v.ToString();
    }

    if (!req.HasFormContentType &&
        req.ContentType?.Contains("application/json", StringComparison.OrdinalIgnoreCase) == true)
    {
        req.EnableBuffering();
        try
        {
            req.Body.Position = 0;
            using var doc = await JsonDocument.ParseAsync(req.Body);
            if (doc.RootElement.TryGetProperty(name, out var prop))
                return prop.ValueKind == JsonValueKind.String ? prop.GetString() : prop.ToString();
        }
        catch { }
        finally { req.Body.Position = 0; }
    }

    if (req.Query.TryGetValue(name, out var qv) && !string.IsNullOrEmpty(qv)) return qv.ToString();
    return null;
}

// ---------- services ----------
var builder = WebApplication.CreateBuilder(args);

// 1) Register services BEFORE Build()
builder.Services.AddSignalR();

// Permissive CORS for dev (your page is on :3000 and Receiver on :5064)
builder.Services.AddCors(options =>
{
    options.AddPolicy("OutloudDev", policy =>
        policy.WithOrigins("http://localhost:3000", "http://127.0.0.1:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

builder.Services.AddSingleton<IStreamBus, StreamBus>();
builder.Services.AddSingleton(_ => new JournalStore(
    Path.Combine(AppContext.BaseDirectory, "data")));

builder.Services.AddSingleton<OutloudOS.Core.StreamAccumulator>();
builder.Services.AddSingleton<OutloudOS.Core.DslRouter>();
builder.Services.AddHttpClient();

// Allow overriding Node base from env; default to your Node app
var nodeBase = Environment.GetEnvironmentVariable("NODE_BASE") ?? "http://localhost:3000";
builder.Services.AddSingleton(new NodeDefaults(nodeBase));

var app = builder.Build();

// 2) Middleware goes AFTER Build()
app.UseCors("OutloudDev");

// HUB
app.MapHub<StreamHub>("/hubs/stream").RequireCors("OutloudDev");

app.MapGet("/", () => Results.Text("OutloudOS Receiver running"));

// ---------- endpoints (robust param read) ----------
app.MapPost("/proto/tok", async (HttpRequest req,
                                 Microsoft.AspNetCore.SignalR.IHubContext<StreamHub> hub,
                                 OutloudOS.Core.StreamAccumulator acc) =>
{
    var chunk = await ReadParamAsync(req, "chunk");
    if (string.IsNullOrWhiteSpace(chunk))
        return Results.BadRequest(new { error = "missing chunk" });

    acc.Add(chunk); // <-- buffer it server-side
    await hub.Clients.All.SendAsync("tok", chunk);
    return Results.Ok(new { ok = true });
}).RequireCors("OutloudDev");


app.MapPost("/proto/tok_end", async (HttpRequest req,
                                     Microsoft.AspNetCore.SignalR.IHubContext<StreamHub> hub,
                                     OutloudOS.Core.StreamAccumulator acc,
                                     JournalStore journal) =>
{
    var reason = await ReadParamAsync(req, "reason") ?? "done";

    // Broadcast end-of-stream to the UI
    await hub.Clients.All.SendAsync("tok_end", reason);

    // Take the accumulated text and persist it to the Journal
    var body = acc.TakeAndReset();
    if (!string.IsNullOrWhiteSpace(body))
        await journal.AppendAsync(body);

    return Results.Ok(new { ok = true, reason, saved = body.Length });
}).RequireCors("OutloudDev");


app.MapPost("/proto/save", async (HttpRequest req, JournalStore journal) =>
{
    var text = await ReadParamAsync(req, "text");
    if (string.IsNullOrWhiteSpace(text))
        return Results.BadRequest(new { error = "missing text" });

    await journal.AppendAsync(text);
    return Results.Ok(new { ok = true });
}).DisableAntiforgery().RequireCors("OutloudDev");

app.MapGet("/proto/readall", async (JournalStore journal) =>
{
    var body = await journal.ReadAllAsync();
    return Results.Ok(new { body });
}).RequireCors("OutloudDev");

app.MapPost("/proto/clear", async (JournalStore journal) =>
{
    var ok = await journal.ClearAsync();
    return ok ? Results.Ok(new { ok = true }) : Results.StatusCode(500);
}).DisableAntiforgery().RequireCors("OutloudDev");

///<summary>
/// Just a temporary self test page for app.MapGet("/ui")
/// Doesnt interfere with main /proto/* or other end points 
/// </summary>


app.MapGet("/ui", () => Results.Content(@"
<!doctype html>
<html><head><meta charset='utf-8'><title>Receiver Self-Test</title></head>
<body style='font-family:monospace'>
  <h3>Receiver Self-Test</h3>
  <div id='status'>status: connecting…</div>
  <div id='log' style='border:1px solid #888;height:200px;overflow:auto;padding:8px'></div>

  <script src='https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js'></script>
  <script>
    const log = (t)=>{ const d=document.createElement('div'); d.textContent=t; document.getElementById('log').appendChild(d); };
    const status = (t,ok)=>{ const s=document.getElementById('status'); s.textContent = 'status: '+t; s.style.color = ok?'#2ecc71':'#c0392b'; };

    const hubUrl = '/hubs/stream';
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect()
      .build();

    conn.on('tok', c => log('[tok] '+c));
    conn.on('tok_end', r => log('[tok_end] '+(r||'done')));
    conn.onreconnecting(()=>status('reconnecting…', false));
    conn.onreconnected(()=>status('online', true));
    conn.onclose(()=>status('offline', false));

    conn.start().then(()=>status('online',true))
                .catch(e=>{ status('failed',false); log(e.toString()); });
  </script>
</body></html>", "text/html"));

app.MapPost("/dsl/run", async (
    HttpRequest req,
    Microsoft.AspNetCore.SignalR.IHubContext<StreamHub> hub,
    OutloudOS.Core.DslRouter dsl,   // from earlier steps
    JournalStore journal,
    IHttpClientFactory httpFactory,
    NodeDefaults node) =>
{
    var line = await ReadParamAsync(req, "line");
    if (string.IsNullOrWhiteSpace(line))
        return Results.BadRequest(new { error = "missing line" });

    await hub.Clients.All.SendAsync("tok", $">> {line}");

    var (action, arg) = dsl.Parse(line);

    // Simple branches: save/read/clear handled locally
    if (action == "save") {
        await journal.AppendAsync(arg);
        await hub.Clients.All.SendAsync("tok", "[dsl] save:ok");
        await hub.Clients.All.SendAsync("tok_end", "dsl_done");
        return Results.Ok(new { ok = true });
    }
    if (action == "read") {
        var body = await journal.ReadAllAsync();
        foreach (var chunk in Chunk(body, 200))
            await hub.Clients.All.SendAsync("tok", chunk);
        await hub.Clients.All.SendAsync("tok_end", "dsl_done");
        return Results.Ok(new { ok = true });
    }
    if (action == "clear") {
        await journal.ClearAsync();
        await hub.Clients.All.SendAsync("tok", "[dsl] clear:ok");
        await hub.Clients.All.SendAsync("tok_end", "dsl_done");
        return Results.Ok(new { ok = true });
    }

    // Default: treat as prompt (call your Node /api/prompt)
    try {
        var http = httpFactory.CreateClient();
        var url  = $"{node.BaseUrl.TrimEnd('/')}/api/prompt";
        var payload = new {
            conversation = new[] { new { role = "user", content = arg } }
        };
        using var resp = await http.PostAsJsonAsync(url, payload);
        resp.EnsureSuccessStatusCode();
        var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
        var text = json.GetProperty("response").GetString() ?? "";

        // Stream it to the UI in small chunks (fake tokenization)
        foreach (var chunk in Chunk(text, 24))
        {
            await hub.Clients.All.SendAsync("tok", chunk);
            await Task.Delay(20);
        }
        await hub.Clients.All.SendAsync("tok_end", "node_done");

        // (optional) append to journal
        if (!string.IsNullOrWhiteSpace(text))
            await journal.AppendAsync(text);

        return Results.Ok(new { ok = true });
    }
    catch (Exception ex) {
        await hub.Clients.All.SendAsync("tok", $"[dsl] prompt error: {ex.Message}");
        await hub.Clients.All.SendAsync("tok_end", "error");
        return Results.Problem(ex.Message);
    }
}).RequireCors("OutloudDev");

// helper (keep near other helpers)
static IEnumerable<string> Chunk(string s, int size) {
    if (string.IsNullOrEmpty(s)) yield break;
    for (int i = 0; i < s.Length; i += size)
        yield return s.Substring(i, Math.Min(size, s.Length - i));
}


app.Run();
