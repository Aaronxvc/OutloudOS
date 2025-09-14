using System;
using System.Threading;
using System.Threading.Tasks;

/// <summary>
/// Tiny “line in / line out” interface so the app doesn’t care if the link is Serial, BLE, or TCP.
/// </summary>
public interface ILineTransport : IAsyncDisposable
{
    /// <summary>Start the link. After this, incoming lines will call the callback.</summary>
    Task StartAsync(Func<string, Task> onLine, CancellationToken ct);

    /// <summary>Send one line to the device. A newline will be added for you.</summary>
    Task SendLineAsync(string line, CancellationToken ct);

    /// <summary>Best guess if we’re connected.</summary>
    bool IsConnected { get; }
}
