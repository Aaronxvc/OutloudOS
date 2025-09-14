using System;

public interface IStreamBus
{
    /// <summary>Raised whenever a streaming chunk arrives (TOK).</summary>
    event Action<string> OnChunk;

    /// <summary>Raised when a stream is finished (TOK_END).</summary>
    event Action<string> OnEnd;

    void PushChunk(string chunk);
    void End(string reason);
}

public sealed class StreamBus : IStreamBus
{
    public event Action<string>? OnChunk;
    public event Action<string>? OnEnd;

    public void PushChunk(string chunk) => OnChunk?.Invoke(chunk);
    public void End(string reason) => OnEnd?.Invoke(reason);
}
