#pragma once
#include <Arduino.h>
#include <functional>

/// <summary>
/// Simple "line in / line out" BLE adapter so the rest of your code
/// can read and write whole lines instead of raw bytes.
/// It sits on top of your existing BleJournal class.
/// </summary>

// Tell the compiler that there is a type called BleJournal somewhere.
// (We do NOT say it's inside BleLink. It's a normal top-level class.)
class BleJournal;

class BleLink {
public:
  /// <summary>Function type for a complete incoming line.</summary>
  using LineHandler = std::function<void(const String&)>;

  /// <summary>
  /// Builds the adapter using your existing BleJournal object.
  /// We don't own it; we just use it.
  /// </summary>
  explicit BleLink(BleJournal& ble) noexcept;

  /// <summary>
  /// Starts BLE and sets the function that should receive lines from the phone/host.
  /// </summary>
  bool begin(const char* deviceName, LineHandler onLine);

  /// <summary>
  /// Call this every loop() so the BLE stack can do its work.
  /// </summary>
  void loop();

  /// <summary>
  /// Sends one line to the phone/host. The phone can split on newlines.
  /// </summary>
  void sendLine(const String& line);

  /// <summary>
  /// Returns true if we believe a central is connected (best effort).
  /// </summary>
  bool isConnected() const;

private:
  BleJournal* _ble;        // pointer to your real BLE service (not owned)
  LineHandler _onLine;     // callback to deliver one complete line up to the app
};
