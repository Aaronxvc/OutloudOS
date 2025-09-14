#pragma once
// Flip v0 pin map for Seeed XIAO ESP32-C3
// These are *logical* project pins; change them to match your wiring.
// C# tether: like an appsettings.json for hardware.

#ifndef DEVICE_NAME
#define DEVICE_NAME "LLMFlip"
#endif

// ---- OLED (I2C) ----
#ifndef OLED_SDA
#define OLED_SDA 4     // XIAO D4
#endif
#ifndef OLED_SCL
#define OLED_SCL 5     // XIAO D5
#endif
#ifndef OLED_ADDR
#define OLED_ADDR 0x3C // most SSD1306 128x64
#endif
#define OLED_WIDTH   128
#define OLED_HEIGHT   64

// ---- Buttons ----
// Buttons wired to GND, using INPUT_PULLUP (pressed=LOW)
#ifndef BTN_A
#define BTN_A 6       // XIAO D6
#endif
#ifndef BTN_B
#define BTN_B 7       // XIAO D7
#endif

// ---- Lid sensor (reed/Hall), optional ----
#ifndef REED
#define REED 8        // XIAO D8
#endif

// ---- Features (compile-time switches) ----
// Flip v0: no on-board mic by default
#define FEAT_I2S_MIC   0
#define FEAT_REED_LID  1
#define FEAT_HAPTIC    0
