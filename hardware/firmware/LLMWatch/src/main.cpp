#include <Arduino.h>
#include <esp_system.h>
#include "OledView.hpp"
#include "BleJournal.hpp"
#include "JournalStore.hpp"
#include "Typist.hpp"
#include "TextWrap.hpp"

// --------- Build-time defaults ----------
#ifndef DEVICE_NAME
#define DEVICE_NAME "LLM Flip v0 (S3)"
#endif
#ifndef BTN_A
#define BTN_A 0   // BOOT button
#endif
#ifndef BTN_B
#define BTN_B 4   // reserved (not used yet)
#endif

// --------- Instances ----------
OledView     oled;
BleJournal   ble;
JournalStore store;
Typist       typist;

// --------- Screens ----------
enum class Screen { Home, Journal, Settings, Typing, Streaming };
static Screen screen = Screen::Home;

// --------- Streaming state ----------
static String   g_streamBuf;
static bool     g_streamActive = false;
static uint32_t g_lastTokenMs = 0;
static const uint32_t STREAM_IDLE_TIMEOUT_MS = 8000;

// --------- Forward decls ----------
static void drawScreen();
static void drawTyping(OledView& oled, const Typist& t);
static void drawStreaming();
static void finishStream(const char* reason);
static void bootStep(const char* title, const char* line1, const char* line2,
                     uint16_t holdLongMs = 1200, uint16_t holdShortMs = 250);

// --------- BLE command handler ----------
static void onBleCommand(const String& cmd) {
  Serial.printf("[BLE cmd] %s\n", cmd.c_str());

  if (cmd.startsWith("TOK:")) {
    String chunk = cmd.substring(4);
    if (!g_streamActive) {
      g_streamActive = true;
      g_streamBuf = "";
      screen = Screen::Streaming;
    }
    g_streamBuf += chunk;
    g_lastTokenMs = millis();
    drawStreaming();
    return;
  }
  if (cmd == "TOK_END") {
    finishStream("Saved");
    return;
  }
  if (cmd.startsWith("SAVE:")) {
    bool ok = store.appendLine(cmd.substring(5));
    ble.notifyText(ok ? "SAVE:OK" : "SAVE:ERR");
    return;
  }
  if (cmd == "READALL") {
    String body = store.readAll();
    ble.notifyText(body.length() ? body : "EMPTY");
    return;
  }
  if (cmd == "CLEAR") {
    ble.notifyText(store.clear() ? "CLEAR:OK" : "CLEAR:ERR");
    return;
  }

  oled.statusPage("BLE CMD", cmd.c_str(), "");
}

// --------- OLED helpers ----------
static void drawHeader(const char* title) {
  oled.println(title);
  oled.println("--------------------");
}

static void drawStreaming() {
  oled.clear();
  drawHeader("Streaming");
  TextWrap::wrapPrint([&](const String& line){
    char buf[64];
    size_t n = (line.length() < 63) ? line.length() : 63;
    line.substring(0, n).toCharArray(buf, n+1);
    oled.println(buf);
  }, g_streamBuf, 20);
  oled.show();
}

static void finishStream(const char* reason) {
  if (g_streamBuf.length()) store.appendLine(g_streamBuf);
  oled.statusPage("Done", reason, "Returning...");
  oled.show();
  delay(450);
  g_streamActive = false;
  g_streamBuf = "";
  screen = Screen::Journal;
  drawScreen();
}

static void drawTyping(OledView& oled, const Typist& t) {
  oled.clear();
  drawHeader("Compose");
  String s = t.c_str();
  for (size_t i = 0; i < s.length(); i += 20) {
    String chunk = s.substring(i, min(i+20, s.length()));
    char buf[64];
    size_t n = (chunk.length() < 63) ? chunk.length() : 63;
    chunk.substring(0, n).toCharArray(buf, n+1);
    oled.println(buf);
  }
  String pick = String("Pick: [") + t.current() + "]";
  {
    char buf[64];
    size_t n = (pick.length() < 63) ? pick.length() : 63;
    pick.substring(0, n).toCharArray(buf, n+1);
    oled.println(buf);
  }
  oled.show();
}

static void drawScreen() {
  if (screen == Screen::Typing)    { drawTyping(oled, typist); return; }
  if (screen == Screen::Streaming) { drawStreaming();          return; }

  oled.clear();
  switch (screen) {
    case Screen::Home:
      drawHeader("Home");
      oled.println("Short: Journal");
      oled.println("Long : Settings");
      oled.println("Triple: Go Home");
      break;
    case Screen::Journal:
      drawHeader("Journal");
      oled.println("Short: Compose");
      oled.println("Long : Read all");
      oled.println("Triple: Go Home");
      break;
    case Screen::Settings:
      drawHeader("Settings");
      oled.println("Short: (reserved)");
      oled.println("Long : Clear log");
      oled.println("Triple: Go Home");
      break;
    default: break;
  }
  oled.show();
}

// --------- Boot visuals ----------
static uint16_t chooseSplashMs(uint16_t longMs, uint16_t shortMs) {
  auto reason = esp_reset_reason();
  if (reason == ESP_RST_POWERON) return longMs;
  return shortMs;
}
static void bootStep(const char* title, const char* line1, const char* line2,
                     uint16_t holdLongMs, uint16_t holdShortMs) {
  oled.statusPage(title, line1, line2);
  oled.show();
  delay(chooseSplashMs(holdLongMs, holdShortMs));
}

// --------- One-button grammar (BTN_A with triple press) ----------
struct OneButton {
  static constexpr uint16_t BTN_SHORT_MAX  = 250;
  static constexpr uint16_t BTN_LONG_MIN   = 350;
  static constexpr uint16_t BTN_VERY_LONG  = 1200;
  static constexpr uint16_t BTN_DOUBLE_GAP = 350;

  bool wasDown = false;
  uint32_t tDown = 0;
  uint32_t lastShortUp = 0;
  uint8_t shortCount = 0;

  void begin() { pinMode(BTN_A, INPUT_PULLUP); }

  void update(std::function<void()> onShort,
              std::function<void()> onDouble,
              std::function<void()> onTriple,
              std::function<void()> onLong,
              std::function<void()> onVeryLong) {
    uint32_t now = millis();
    bool down = (digitalRead(BTN_A) == LOW);

    // finalize multi-clicks if time passes
    if (shortCount > 0 && (now - lastShortUp) > BTN_DOUBLE_GAP) {
      if (shortCount == 1) onShort();
      else if (shortCount == 2) onDouble();
      shortCount = 0;
    }

    if (down && !wasDown) tDown = now;

    if (!down && wasDown) {
      uint32_t held = now - tDown;
      if (held <= BTN_SHORT_MAX) {
        shortCount++;
        lastShortUp = now;
        if (shortCount == 3) {
          onTriple();
          shortCount = 0;
        }
      } else if (held >= BTN_VERY_LONG) {
        shortCount = 0; onVeryLong();
      } else if (held >= BTN_LONG_MIN) {
        shortCount = 0; onLong();
      } else {
        shortCount = 0; onShort();
      }
    }
    wasDown = down;
  }
};
static OneButton one;

// --------- Arduino entry points ----------
void setup() {
  Serial.begin(115200);
  delay(300);

  bootStep("OutloudOS", "Flipper Terminal", "", 1500, 250);
  bool oledOk = oled.begin();
  bootStep(DEVICE_NAME, oledOk ? "OLED: OK" : "OLED: FAIL", "Mounting FS...", 900, 150);
  bool fsOk = store.begin();
  if (!fsOk) Serial.println("LittleFS mount failed");
  bootStep(DEVICE_NAME, fsOk ? "FS: OK" : "FS: FAIL", "Starting BLE...", 900, 150);
  ble.begin(DEVICE_NAME, onBleCommand);
  bootStep(DEVICE_NAME, "BLE: Ready", "Open phone app", 1200, 200);

  one.begin();
  typist.clear();
  screen = Screen::Home;
  drawScreen();
}

void loop() {
  const uint32_t now = millis();

  ble.loop();

  if (g_streamActive && (now - g_lastTokenMs) > STREAM_IDLE_TIMEOUT_MS) {
    finishStream("Timeout");
  }

  one.update(
    /* onShort  */ [](){
      switch (screen) {
        case Screen::Home:     screen = Screen::Journal;  drawScreen(); break;
        case Screen::Journal:  screen = Screen::Typing;   typist.clear(); drawTyping(oled, typist); break;
        case Screen::Settings: /* reserved */ break;
        case Screen::Typing:   typist.next();  drawTyping(oled, typist); break;
        case Screen::Streaming: /* ignore */ break;
      }
    },
    /* onDouble */ [](){
      if (screen == Screen::Typing) { typist.backspace(); drawTyping(oled, typist); }
    },
    /* onTriple */ [](){
      screen = Screen::Home;
      drawScreen();
    },
    /* onLong   */ [](){
      switch (screen) {
        case Screen::Home:     screen = Screen::Settings; drawScreen(); break;
        case Screen::Journal: {
          ble.notifyText("READALL");
          oled.statusPage("Journal", "Requested READALL", "");
          oled.show();
          delay(350);
          drawScreen();
        } break;
        case Screen::Settings: {
          ble.notifyText("CLEAR");
          oled.statusPage("Settings", "CLEAR requested", "");
          oled.show();
          delay(350);
          drawScreen();
        } break;
        case Screen::Typing:   typist.accept(); drawTyping(oled, typist); break;
        case Screen::Streaming: /* ignore */ break;
      }
    },
    /* onVeryLong */ [](){
      if (screen == Screen::Typing) {
        String payload = String("PROMPT:") + typist.c_str();
        ble.notifyText(payload);
        oled.statusPage("Sending...", "See phone app", "");
        oled.show();
        delay(400);
        screen = Screen::Journal; drawScreen();
      }
    }
  );
}