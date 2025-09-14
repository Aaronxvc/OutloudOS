#pragma once
// BLE wrapper for Journal service (NimBLE-Arduino).

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <functional>

#define UUID_SVC  "0000A100-0000-1000-8000-00805F9B34FB"
#define UUID_CMD  "0000A101-0000-1000-8000-00805F9B34FB"
#define UUID_TEXT "0000A102-0000-1000-8000-00805F9B34FB"
#define UUID_MTU  "0000A103-0000-1000-8000-00805F9B34FB"

class BleJournal {
public:
  using OnCommand = std::function<void(const String&)>;

  bool begin(const char* deviceName, OnCommand onCommand) {
    _onCommand = onCommand;

    NimBLEDevice::init(deviceName);
    NimBLEDevice::setPower(ESP_PWR_LVL_P9);
    NimBLEDevice::setSecurityAuth(false, false, false);
    NimBLEDevice::setMTU(_preferredMTU);

    _server = NimBLEDevice::createServer();
    _server->setCallbacks(&_serverCbs);

    NimBLEService* svc = _server->createService(UUID_SVC);

    _cmd = svc->createCharacteristic(UUID_CMD,
             NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
    _cmd->setCallbacks(&_cmdCbs);
    _cmdCbs.setOwner(this);

    _text = svc->createCharacteristic(UUID_TEXT,
              NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::READ);

    _mtu = svc->createCharacteristic(UUID_MTU, NIMBLE_PROPERTY::READ);
    _mtu->setValue(String(_preferredMTU).c_str());

    svc->start();

    NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
    adv->addServiceUUID(UUID_SVC);
    adv->setName(deviceName);
    NimBLEDevice::startAdvertising();
    _advertising = true;
    return true;
  }

  void loop() {
    // no-op; place reconnect/backoff here later
  }

  void notifyText(const String& msg) {
    if (!_text) return;
    const size_t maxPayload = (_preferredMTU > 23) ? (_preferredMTU - 3) : 20;
    size_t pos = 0;
    while (pos < msg.length()) {
      size_t len = std::min(maxPayload, msg.length() - pos);
      std::string chunk = msg.substring(pos, pos + len).c_str();
      _text->setValue(chunk);
      _text->notify();
      pos += len;
      delay(5);
    }
  }

  bool isConnected() const {
    return _server && _server->getConnectedCount() > 0;
  }

private:
  // ---- Callbacks ----
  class CmdCallbacks : public NimBLECharacteristicCallbacks {
  public:
    void setOwner(BleJournal* owner) { _owner = owner; }
    void onWrite(NimBLECharacteristic* ch) {             // no 'override' to satisfy all versions
      if (!_owner || !_owner->_onCommand) return;
      std::string value = ch->getValue();
      _owner->_onCommand(String(value.c_str()));
    }
  private:
    BleJournal* _owner = nullptr;
  };

  class ServerCallbacks : public NimBLEServerCallbacks {
  public:
    // Some NimBLE versions call this overload:
    void onConnect(NimBLEServer* s) { (void)s; }

    // Some call this one with connection descriptor:
    void onConnect(NimBLEServer* s, ble_gap_conn_desc* desc) { (void)s; (void)desc; }

    void onDisconnect(NimBLEServer* s) {
      (void)s;
      NimBLEDevice::startAdvertising();
    }

    // Optional in some versions:
    void onMTUChange(uint16_t mtu, ble_gap_conn_desc* desc) { (void)mtu; (void)desc; }
  };

  // ---- Members ----
  NimBLEServer* _server = nullptr;
  NimBLECharacteristic* _cmd  = nullptr;
  NimBLECharacteristic* _text = nullptr;
  NimBLECharacteristic* _mtu  = nullptr;

  ServerCallbacks _serverCbs;
  CmdCallbacks    _cmdCbs;

  bool _advertising = false;
  uint16_t _preferredMTU = 185;
  OnCommand _onCommand;
};
