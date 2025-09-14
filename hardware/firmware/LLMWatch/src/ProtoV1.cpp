#include "ProtoV1.hpp"
#include "BleLink.hpp"

/// <summary>Store transport reference only.</summary>
ProtoV1::ProtoV1(BleLink& link) noexcept : _link(link) {}

/// <summary>Register inbound line handler and announce HELLO.</summary>
void ProtoV1::begin(const char* deviceName, const ProtoHandlers& h) {
  _h = h;
  _link.begin(deviceName, [this](const String& line) { _onLine(line); });

  // Send a simple HELLO so the peer can sanity-check the protocol.
  String hello = String("HELLO name=") + deviceName + " proto=1";
  _link.sendLine(hello);
}

/// <summary>Pump BLE link, resends, and heartbeats.</summary>
void ProtoV1::loop(uint32_t nowMs) {
  _link.loop();
  _txPump(nowMs);

  // Heartbeat (optional)
  if (nowMs - _lastPingMs >= PING_EVERY_MS) {
    _lastPingMs = nowMs;
    _link.sendLine(String("PING ts=") + nowMs);
  }
}

/// <summary>Send a prompt header + DATA lines. Only the header expects ACK.</summary>
uint32_t ProtoV1::sendPrompt(const String& text) {
  const uint32_t id = _nextId++;
  const String hdr = String("PROMPT id=") + id + " len=" + text.length();
  _txEnqueue(id, hdr);                // track for ACK
  _link.sendLine(hdr);

  // DATA lines (chunk into ~120 chars to keep it readable)
  const size_t CHUNK = 120;
  for (size_t i = 0; i < text.length(); i += CHUNK) {
    String chunk = text.substring(i, i + CHUNK);
    _link.sendLine(String("DATA ") + chunk);
  }
  return id;
}

/// <summary>Send a DSL command. The whole string after 'cmd=' is considered the command.</summary>
uint32_t ProtoV1::sendDsl(const String& cmd) {
  const uint32_t id = _nextId++;
  String line = String("DSL id=") + id + " cmd=" + cmd;
  _txEnqueue(id, line);
  _link.sendLine(line);
  return id;
}

/// <summary>Send SAVE with one line. Expects ACK + later SAVE_OK/ERR.</summary>
uint32_t ProtoV1::sendSaveLine(const String& line) {
  const uint32_t id = _nextId++;
  // Note: keep the payload on the same line for simplicity
  String msg = String("SAVE id=") + id + " line=" + line;
  _txEnqueue(id, msg);
  _link.sendLine(msg);
  return id;
}

/// <summary>Request the whole body (READALL). Expects ACK + BODY/DATA.../BODY_END.</summary>
uint32_t ProtoV1::sendReadAll() {
  const uint32_t id = _nextId++;
  String msg = String("READALL id=") + id;
  _txEnqueue(id, msg);
  _link.sendLine(msg);
  return id;
}

/// <summary>Ask host to clear the journal. Expects ACK + CLEAR_OK/ERR.</summary>
uint32_t ProtoV1::sendClear() {
  const uint32_t id = _nextId++;
  String msg = String("CLEAR id=") + id;
  _txEnqueue(id, msg);
  _link.sendLine(msg);
  return id;
}


/// <summary>ACK helper.</summary>
void ProtoV1::sendAck(uint32_t id)        { _link.sendLine(String("ACK id=")  + id); }
/// <summary>NACK helper.</summary>
void ProtoV1::sendNack(uint32_t id, const String& reason) { _link.sendLine(String("NACK id=") + id + " reason=" + reason); }

/// <summary>Reply OK/ERR for save operations.</summary>
void ProtoV1::sendSaveOk(uint32_t id, bool ok) { _link.sendLine(String(ok ? "SAVE_OK id=" : "SAVE_ERR id=") + id); }

/// <summary>Send a whole body with length for integrity; ends with BODY_END.</summary>
void ProtoV1::sendBody(uint32_t id, const String& body) {
  _link.sendLine(String("BODY id=") + id + " len=" + body.length());
  const size_t CHUNK = 120;
  for (size_t i = 0; i < body.length(); i += CHUNK) {
    _link.sendLine(String("DATA ") + body.substring(i, i + CHUNK));
  }
  _link.sendLine(String("BODY_END id=") + id);
}

/// <summary>Transport connectivity hint.</summary>
bool ProtoV1::connected() const noexcept { return _link.isConnected(); }

/// <summary>Inbound line parser. Accepts both new v1 frames and your legacy "TOK:"/"TOK_END".</summary>
void ProtoV1::_onLine(const String& raw) {
  const String line = _trim(raw);

   // Keep a simple BODY accumulator alongside token streaming.
  static bool bodyActive = false;
  static uint32_t bodyId = 0;
  static String bodyBuf;

  if (line.length() == 0) return;

    // --- DATA handling for both TOK streaming and BODY accumulation ---
  if (_startsWith(line, "DATA ")) {
    String payload = line.substring(5);

    // If a BODY is active, accumulate it
    if (bodyActive) {
      bodyBuf += payload;
      bodyBuf += '\n'; // optional: preserve newlines
    }

    // Also forward to onTok for streaming text UIs (harmless for BODY)
    if (_h.onTok) _h.onTok(payload);
    return;
  }


  // Extract CMD + tokens
  int sp = line.indexOf(' ');
  String cmd = (sp < 0) ? line : line.substring(0, sp);
  String rest = (sp < 0) ? String() : line.substring(sp + 1);

  // Parse simple key=value tokens into a tiny map
  std::map<String, String> kv;
  int pos = 0;
  while (pos < (int)rest.length()) {
    int next = rest.indexOf(' ', pos);
    String tok = (next < 0) ? rest.substring(pos) : rest.substring(pos, next);
    if (tok.length() > 0) {
      int eq = tok.indexOf('=');
      if (eq > 0) {
        kv[tok.substring(0, eq)] = tok.substring(eq + 1);
      }
    }
    if (next < 0) break;
    pos = next + 1;
  }

  // Handle a few core commands
  if (cmd == "ACK") {
    auto it = kv.find("id");
    if (it != kv.end()) {
      uint32_t id = it->second.toInt();
      _pending.erase(id);
      if (_h.onAck) _h.onAck(id);
    }
    return;
  }

  if (cmd == "NACK") {
    uint32_t id = kv.count("id") ? kv["id"].toInt() : 0;
    String reason = kv.count("reason") ? kv["reason"] : "unknown";
    _pending.erase(id);
    if (_h.onNack) _h.onNack(id, reason);
    return;
  }

  if (cmd == "PING") {
    if (_h.onPing) _h.onPing();
    _link.sendLine("PONG");
    return;
  }

  if (cmd == "TOK") {
    // Allow "TOK chunk=..." from a v1 host
    String chunk = kv.count("chunk") ? kv["chunk"] : String();
    if (_h.onTok) _h.onTok(chunk);
    return;
  }

  if (cmd == "TOK_END") {
    if (_h.onTokEnd) _h.onTokEnd();
    return;
  }

    // --- SAVE replies ---
  if (cmd == "SAVE_OK" || cmd == "SAVE_ERR") {
    uint32_t id = kv.count("id") ? kv["id"].toInt() : 0;
    bool ok = (cmd == "SAVE_OK");
    _pending.erase(id);
    if (_h.onSaveResult) _h.onSaveResult(id, ok);
    return;
  }

  // --- CLEAR replies ---
  if (cmd == "CLEAR_OK" || cmd == "CLEAR_ERR") {
    uint32_t id = kv.count("id") ? kv["id"].toInt() : 0;
    bool ok = (cmd == "CLEAR_OK");
    _pending.erase(id);
    if (_h.onClearResult) _h.onClearResult(id, ok);
    return;
  }

  // --- BODY / DATA / BODY_END for READALL ---
  if (cmd == "BODY") {
    bodyActive = true;
    bodyId = kv.count("id") ? kv["id"].toInt() : 0;
    bodyBuf = "";
    return;
  }

  if (cmd == "DATA") {
    // DATA chunk (already handled for TOK, but share for body too).
    // We’ll just append the raw rest of the line after "DATA ".
    // Note: above we already handled "DATA " early for TOK streaming.
    // To make BODY work too, ensure that early path also reaches here if needed.
    // (If you prefer separate paths, you can keep TOK vs BODY separate.)
    return;
  }

  if (cmd == "BODY_END") {
    uint32_t id = kv.count("id") ? kv["id"].toInt() : 0;
    if (bodyActive && id == bodyId) {
      if (_h.onBody) _h.onBody(id, bodyBuf);
    }
    bodyActive = false;
    bodyId = 0;
    bodyBuf = "";
    return;
  }

}

/// <summary>Track a line that requires an ACK.</summary>
void ProtoV1::_txEnqueue(uint32_t id, const String& line) {
  OutTx tx{ line, id, 1, millis() };
  _pending[id] = tx;
}

/// <summary>Resend lines that haven't been ACKed within timeout (up to retries).</summary>
void ProtoV1::_txPump(uint32_t nowMs) {
  for (auto it = _pending.begin(); it != _pending.end(); ) {
    OutTx& tx = it->second;
    if (nowMs - tx.lastSend >= ACK_TIMEOUT_MS) {
      if (tx.tries >= ACK_RETRIES) {
        // Give up; notify as NACK
        if (_h.onNack) _h.onNack(tx.id, "ack-timeout");
        it = _pending.erase(it);
        continue;
      }
      tx.tries++;
      tx.lastSend = nowMs;
      _link.sendLine(tx.line);
    }
    ++it;
  }
}

/// <summary>Trim spaces and CRLF.</summary>
String ProtoV1::_trim(const String& s) {
  int a = 0, b = s.length() - 1;
  while (a <= b && (s[a] == ' ' || s[a] == '\r' || s[a] == '\n' || s[a] == '\t')) a++;
  while (b >= a && (s[b] == ' ' || s[b] == '\r' || s[b] == '\n' || s[b] == '\t')) b--;
  return (a <= b) ? s.substring(a, b + 1) : String();
}
bool ProtoV1::_startsWith(const String& s, const char* prefix) {
  size_t n = strlen(prefix);
  return s.length() >= n && s.substring(0, n) == prefix;
}
