#pragma once
// Minimal text input helper for two-button devices.
// "Wheel" of characters + a small buffer you can render on screen.

#include <Arduino.h>

class Typist {
public:
  // Wheel characters (edit to taste)
  // Keep common ones first; last char is a visible underscore hint for space
  const char* WHEEL = "abcdefghijklmnopqrstuvwxyz0123456789.,?!-_";

  void clear() {
    _buf[0] = '\0';
    _cursor = 0;
    _wheelIdx = 0;
  }

  // Move selection to the next character on the wheel
  void next() {
    _wheelIdx = (_wheelIdx + 1) % strlen(WHEEL);
  }

  // Append the currently selected char (if space hint '_', add space)
  void accept() {
    char c = WHEEL[_wheelIdx];
    if (c == '_') c = ' ';
    _push(c);
  }

  // Add a real space (mapped to A long)
  void space() { _push(' '); }

  // Remove last char
  void backspace() {
    if (_cursor > 0) {
      _cursor--;
      _buf[_cursor] = '\0';
    }
  }

  // Expose C string (safe for BLE notify / printf)
  const char* c_str() const { return _buf; }

  // Current wheel char for UI
  char current() const { return WHEEL[_wheelIdx]; }

private:
  static constexpr size_t MAX = 128; // max prompt length for v1
  char _buf[MAX+1] = {0};
  size_t _cursor = 0;
  size_t _wheelIdx = 0;

  void _push(char c) {
    if (_cursor < MAX) {
      _buf[_cursor++] = c;
      _buf[_cursor]   = '\0';
    }
  }
};
