#pragma once
#include <Arduino.h>
#include <functional>
#include <map>

/// <summary>
/// Callbacks from ProtoV1 to the app (watch firmware).
/// These are minimal for v1; add more as needed.
/// </summary>
struct ProtoHandlers {
  /// <summary>Incoming token chunk (host → watch).</summary>
  std::function<void(const String&)> onTok;

  /// <summary>Token stream ended (host → watch).</summary>
  std::function<void()> onTokEnd;

  /// <summary>ACK for a command we sent (watch → host).</summary>
  std::function<void(uint32_t /*id*/)> onAck;

  /// <summary>NACK/ERROR for a command we sent.</summary>
  std::function<void(uint32_t /*id*/, const String& /*reason*/)> onNack;

  /// <summary>Peer ping (host → watch). Use to keep UI alive.</summary>
  std::function<void()> onPing;
 
  /// <summary>Host replied to SAVE: true=ok, false=err (id matches the request).</summary>
  std::function<void(uint32_t /*id*/, bool /*ok*/)> onSaveResult;

  /// <summary>Host replied with the full journal body (id matches the request).</summary>
  std::function<void(uint32_t /*id*/, const String& /*body*/)> onBody;

  /// <summary>Host replied to CLEAR: true=ok, false=err (id matches the request).</summary>
  std::function<void(uint32_t /*id*/, bool /*ok*/)> onClearResult;
};

class BleLink; // forward: we only store a ref; definitions live in .cpp

/// <summary>
/// Tiny, line-based protocol v1:
/// - Human-readable lines: "CMD key=value key=value"
/// - DATA lines: "DATA <raw text>"
/// - ACK/NACK with id for reliability
/// </summary>
class ProtoV1 {
public:
  /// <summary>Create a protocol bound to a line transport.</summary>
  explicit ProtoV1(BleLink& link) noexcept;

  /// <summary>Start protocol; registers line callback and emits HELLO.</summary>
  void begin(const char* deviceName, const ProtoHandlers& h);

  /// <summary>Run periodic work: pump link + resends + heartbeats.</summary>
  void loop(uint32_t nowMs);

  // ===== Watch → Host commands =====

  /// <summary>Send a free-form prompt; returns command id (for tracking).</summary>
  uint32_t sendPrompt(const String& text);

  /// <summary>Send a DSL command; returns command id.</summary>
  uint32_t sendDsl(const String& cmd);

  /// <summary>Ask the host to save a single journal line.</summary>
  uint32_t sendSaveLine(const String& line);

   /// <summary>Ask the host to return the whole journal body.</summary>
  uint32_t sendReadAll(); 

  /// <summary>Ask the host to clear the journal.</summary>
  uint32_t sendClear();

  // ===== Host → Watch helper replies (optional if you act as host) =====
  void sendAck(uint32_t id);
  void sendNack(uint32_t id, const String& reason);
  void sendSaveOk(uint32_t id, bool ok);
  void sendBody(uint32_t id, const String& body);

  /// <summary>Transport connectivity hint.</summary>
  bool connected() const noexcept;

private:
  BleLink& _link;
  ProtoHandlers _h;

  struct OutTx {
    String   line;
    uint32_t id;
    uint8_t  tries;
    uint32_t lastSend;
  };

  std::map<uint32_t, OutTx> _pending;
  uint32_t _nextId = 1;
  uint32_t _lastPingMs = 0;

  static constexpr uint32_t ACK_TIMEOUT_MS = 800;
  static constexpr uint8_t  ACK_RETRIES    = 3;
  static constexpr uint32_t PING_EVERY_MS  = 3000;

  void _onLine(const String& line);
  void _txEnqueue(uint32_t id, const String& line);
  void _txPump(uint32_t nowMs);
  static String _trim(const String& s);
  static bool _startsWith(const String& s, const char* prefix);
};
