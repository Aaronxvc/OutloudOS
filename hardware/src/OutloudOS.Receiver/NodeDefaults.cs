namespace OutloudOS.Receiver;

/// <summary>
/// Holds the base URL of your Node API server so the Receiver can call it.
/// Defaults to http://localhost:3000 unless overridden by the NODE_BASE env var.
/// </summary>
public record NodeDefaults(string BaseUrl);
