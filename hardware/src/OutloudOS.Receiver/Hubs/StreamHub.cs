using Microsoft.AspNetCore.SignalR;

namespace OutloudOS.Receiver.Hubs;

/// <summary>
/// Real-time endpoint: browsers connect here to receive streaming tokens.
/// </summary>
public sealed class StreamHub : Hub { }
