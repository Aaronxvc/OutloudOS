#pragma once
// Two-button helper with debouncing, short, long, very-long, and double-click.
// Wiring: each button pin -> GND with INPUT_PULLUP enabled (pressed = LOW).

#include <Arduino.h>

class Buttons {
public:
  // --- Tunables ---
  static constexpr uint16_t DEBOUNCE_MS    = 25;    // ignore chatter
  static constexpr uint16_t LONG_MS        = 550;   // hold >= this => long
  static constexpr uint16_t VERYLONG_MS    = 1500;  // hold >= this => very long
  static constexpr uint16_t DOUBLE_GAP_MS  = 300;   // second short within this gap

  bool begin(uint8_t pinA, uint8_t pinB) {
    _a.pin = pinA; _b.pin = pinB;
    pinMode(_a.pin, INPUT_PULLUP);
    pinMode(_b.pin, INPUT_PULLUP);

    // initialize debounced state
    _a.level = _a.lastStable = digitalRead(_a.pin);
    _b.level = _b.lastStable = digitalRead(_b.pin);
    uint32_t now = millis();
    _a.lastChange = _b.lastChange = now;
    return true;
  }

  // Call from loop() every iteration
  void update() {
    _updateOne(_a);
    _updateOne(_b);
  }

  // --- A button events (read-once per event) ---
  bool aPressed()      { return _take(_a.pressed); }
  bool aDouble()       { return _take(_a.doublePressed); }
  bool aLongPressed()  { return _take(_a.longPressed); }
  bool aVeryLong()     { return _take(_a.veryLongPressed); }

  // --- B button events (read-once per event) ---
  bool bPressed()      { return _take(_b.pressed); }
  bool bDouble()       { return _take(_b.doublePressed); }
  bool bLongPressed()  { return _take(_b.longPressed); }
  bool bVeryLong()     { return _take(_b.veryLongPressed); }

private:
  struct Btn {
    uint8_t  pin            = 0;

    // debouncer
    int      level          = HIGH;        // instantaneous raw read
    int      lastStable     = HIGH;        // debounced level
    uint32_t lastChange     = 0;           // when raw level changed

    // press tracking
    bool     isHeld         = false;       // currently pressed (debounced LOW)
    uint32_t pressStart     = 0;           // when stable LOW began
    bool     longFired      = false;       // fired LONG while held
    bool     veryLongFired  = false;       // fired VERYLONG while held

    // double-click
    bool     waitingSecond  = false;       // waiting for second short?
    uint32_t lastRelease    = 0;           // when went HIGH last time

    // latched events (read-once)
    bool     pressed        = false;       // short
    bool     doublePressed  = false;
    bool     longPressed    = false;
    bool     veryLongPressed= false;
  };

  static bool _take(bool& f) { bool v = f; f = false; return v; }

  static inline int _readRaw(const Btn& b) {
    return digitalRead(b.pin);
  }

  void _updateOne(Btn& b) {
    const uint32_t t = millis();
    const int raw = _readRaw(b);

    // raw edge -> start debounce window
    if (raw != b.level) {
      b.level = raw;
      b.lastChange = t;
    }

    // accept debounced level after quiet period
    if ((t - b.lastChange) >= DEBOUNCE_MS && b.lastStable != b.level) {
      // edge: HIGH->LOW (press began)
      if (b.lastStable == HIGH && b.level == LOW) {
        b.isHeld        = true;
        b.pressStart    = t;
        b.longFired     = false;
        b.veryLongFired = false;
        // do NOT emit short here; we decide on release or while-held thresholds
      }
      // edge: LOW->HIGH (released)
      else if (b.lastStable == LOW && b.level == HIGH) {
        const uint32_t held = t - b.pressStart;

        // If neither long nor very-long fired during the hold, this was a short
        if (!b.longFired && !b.veryLongFired) {
          // handle short vs double
          if (b.waitingSecond && (t - b.lastRelease) <= DOUBLE_GAP_MS) {
            b.doublePressed = true;
            b.waitingSecond = false;
          } else {
            b.pressed       = true;
            b.waitingSecond = true;
            b.lastRelease   = t;
          }
        } else {
          // long/very-long happened: suppress short/double
          b.waitingSecond = false;
        }

        b.isHeld = false;
      }

      b.lastStable = b.level;
    }

    // While held: fire long and very-long once each, at thresholds
    if (b.isHeld) {
      const uint32_t held = t - b.pressStart;

      // Very long wins and suppresses long (if not already fired)
      if (!b.veryLongFired && held >= VERYLONG_MS) {
        b.veryLongFired   = true;
        b.longFired       = true;   // suppress long once very long fires
        b.waitingSecond   = false;  // no short/double after this
        b.veryLongPressed = true;   // latch event
      }
      else if (!b.longFired && held >= LONG_MS) {
        b.longFired       = true;
        b.waitingSecond   = false;  // no short/double after this
        b.longPressed     = true;   // latch event
      }
    }

    // If we were waiting for a double but time expired -> finalize as single (already latched)
    if (b.waitingSecond && (t - b.lastRelease) > DOUBLE_GAP_MS) {
      b.waitingSecond = false;
    }
  }

  Btn _a, _b;
};
