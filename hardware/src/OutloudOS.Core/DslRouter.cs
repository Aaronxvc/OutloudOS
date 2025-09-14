namespace OutloudOS.Core;

/// <summary>
/// Very small DSL router (stub). Recognizes a few commands and returns what to do.
/// Keep it simple now; expand later.
/// </summary>
public sealed class DslRouter
{
    /// <summary>
    /// Handle one DSL line. For now, return a tuple describing the action.
    /// "prompt" = ask the model (we’ll fake a stream here).
    /// "save"   = save a line to journal.
    /// "read"   = read journal.
    /// "clear"  = clear journal.
    /// </summary>
    public (string Action, string Arg) Parse(string line)
    {
        var s = (line ?? "").Trim();

        // save "text here"
        if (s.StartsWith("save ", StringComparison.OrdinalIgnoreCase))
            return ("save", s.Substring(5).Trim().Trim('"'));

        // read / clear
        if (s.Equals("read", StringComparison.OrdinalIgnoreCase))  return ("read",  "");
        if (s.Equals("clear", StringComparison.OrdinalIgnoreCase)) return ("clear", "");

        // prompt "...", or fallback: free text is treated as prompt
        if (s.StartsWith("prompt ", StringComparison.OrdinalIgnoreCase))
            return ("prompt", s.Substring(7).Trim().Trim('"'));

        return ("prompt", s); // default: treat the whole line as a prompt
    }
}
