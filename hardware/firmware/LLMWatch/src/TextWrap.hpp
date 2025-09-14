#pragma once
// Minimal word-wrapping for OLED (128 px wide, ~21 ASCII chars per line at size=1).
// Keeps it simple: wrap at 20 chars or on spaces where possible.

#include <Arduino.h>

class TextWrap {
public:
  // Render 'msg' as multiple lines using 'println'.
  template<typename Printer>
  static void wrapPrint(Printer&& println, const String& msg, uint8_t width = 20) {
    size_t i = 0;
    while (i < msg.length()) {
      size_t remaining = msg.length() - i;
      size_t take = remaining < width ? remaining : width;

      // Try to break on last space within [i, i+take)
      size_t lineEnd = i + take;
      if (remaining > width) {
        size_t lastSpace = msg.lastIndexOf(' ', i + take - 1);
        if (lastSpace != -1 && lastSpace >= (int)i) {
          lineEnd = lastSpace; // break before the space
        }
      }

      String line = msg.substring(i, lineEnd);
      println(line);

      // Skip the space if we broke on one
      i = (lineEnd < msg.length() && msg.charAt(lineEnd) == ' ') ? lineEnd + 1 : lineEnd;
    }
  }
};
