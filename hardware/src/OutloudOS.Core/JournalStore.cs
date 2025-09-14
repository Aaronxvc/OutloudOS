using System.Text;

/// <summary>
/// Tiny text file store for journal lines. One file, append-only.
/// </summary>
public sealed class JournalStore
{
    private readonly string _path;

    /// <summary>Creates a journal store in the given folder (file: journal.txt).</summary>
    public JournalStore(string folder)
    {
        Directory.CreateDirectory(folder);
        _path = Path.Combine(folder, "journal.txt");
        if (!File.Exists(_path)) File.WriteAllText(_path, "");
    }

    /// <summary>Adds one line to the journal (with newline).</summary>
    public Task AppendAsync(string line) =>
        File.AppendAllTextAsync(_path, line + Environment.NewLine, Encoding.UTF8);

    /// <summary>Returns the entire file as a single string.</summary>
    public Task<string> ReadAllAsync() =>
        File.ReadAllTextAsync(_path, Encoding.UTF8);

    /// <summary>Deletes the journal file and recreates it empty.</summary>
    public Task<bool> ClearAsync()
    {
        try
        {
            File.Delete(_path);
            File.WriteAllText(_path, "");
            return Task.FromResult(true);
        }
        catch { return Task.FromResult(false); }
    }
}
