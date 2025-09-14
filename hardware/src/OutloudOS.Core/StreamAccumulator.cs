using System.Text;

namespace OutloudOS.Core;

/// <summary>
/// Buffers the current streaming reply (TOK chunks) so that when the stream ends,
/// we can save the full text to the Journal in one go.
/// </summary>
public sealed class StreamAccumulator
{
    private readonly object _gate = new();
    private readonly StringBuilder _sb = new();

    /// <summary>Add one chunk to the in-progress stream.</summary>
    public void Add(string chunk)
    {
        lock (_gate) _sb.Append(chunk);
    }

    /// <summary>
    /// Take the buffered text and reset the buffer.
    /// Returns the full stream text since the last reset.
    /// </summary>
    public string TakeAndReset()
    {
        lock (_gate)
        {
            var s = _sb.ToString();
            _sb.Clear();
            return s;
        }
    }
}
