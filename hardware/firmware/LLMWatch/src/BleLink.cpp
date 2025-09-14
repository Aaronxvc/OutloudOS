#include "BleLink.hpp"
#include "BleJournal.hpp"  // this is your existing BLE service

/// <summary>Keep a pointer to the BLE service we will use.</summary>
BleLink::BleLink(BleJournal& ble) noexcept : _ble(&ble) {}

/// <summary>
/// Start BLE and wire our "line" callback into BleJournal's callback.
/// </summary>
bool BleLink::begin(const char* deviceName, LineHandler onLine) {
  _onLine = std::move(onLine);

  // BleJournal already knows how to start advertising and receive text.
  // We pass it a callback that forwards each inbound line to _onLine.
  _ble->begin(deviceName, [this](const String& line) {
    if (_onLine) _onLine(line);
  });
  return true;
}

/// <summary>Let BleJournal do background work each loop().</summary>
void BleLink::loop() {
  _ble->loop();
}

/// <summary>Send one line out over BLE.</summary>
void BleLink::sendLine(const String& line) {
  _ble->notifyText(line);
}

/// <summary>
/// If BleJournal has a real connectivity check, call it here.
/// If not, return true so the UI doesn't get stuck.
/// </summary>
bool BleLink::isConnected() const {
  // If you add BleJournal::isConnected(), switch to that:
  // return _ble->isConnected();
  return true;
}
