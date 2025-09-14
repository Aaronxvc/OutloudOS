#pragma once
// Simple append-only journaling to LittleFS (flash).
// C# tether: think StreamWriter.AppendLine + File.ReadAllText in a small service.

#include <Arduino.h>
#include <LittleFS.h>

class JournalStore {
public:
  // Mount the FS; format if missing (safe for dev).
  bool begin() {
    // true = format if mount fails (dev-friendly). For production, handle errors differently.
    if (!LittleFS.begin(true)) return false;
    return true;
  }

  // Append one line (a newline is added).
  bool appendLine(const String& line) {
    File f = LittleFS.open(_path, FILE_APPEND);
    if (!f) return false;
    f.println(line);
    f.close();
    return true;
  }

  // Read entire journal as a single string (for debugging).
  String readAll() {
    if (!LittleFS.exists(_path)) return String();
    File f = LittleFS.open(_path, FILE_READ);
    if (!f) return String();

    String out;
    out.reserve(f.size());
    while (f.available()) {
      out += (char)f.read();
    }
    f.close();
    return out;
  }

  // Optional: truncate file (start fresh)
  bool clear() {
    if (LittleFS.exists(_path)) {
      return LittleFS.remove(_path);
    }
    return true;
  }

private:
  const char* _path = "/journal.txt";
};
