#pragma once
// Watch v0 pin map for Seeed XIAO ESP32-C3 (re-using the same MCU)
// Adjust these ideas to your physical layout later.

#ifndef DEVICE_NAME
#define DEVICE_NAME "LLMWatch"
#endif

// ---- OLED (I2C) ----
#ifndef OLED_SDA
#define OLED_SDA 4
#endif
#ifndef OLED_SCL
#define OLED_SCL 5
#endif
#ifndef OLED_ADDR
#define OLED_ADDR 0x3C
#endif
#define OLED_WIDTH   128
#define OLED_HEIGHT   64

// ---- Controls ----
// Example: crown encoder uses two pins, side button is BTN_A
#ifndef BTN_A
#define BTN_A 6       // side button
#endif
#ifndef BTN_B
#define BTN_B 7       // secondary / long-press action
#endif
// Optional: define encoder pins later (ENC_A, ENC_B)

// ---- Features ----
#define FEAT_I2S_MIC   1   // on a watch you may add a MEMS mic later
#define FEAT_REED_LID  0   // watch has no lid
#define FEAT_HAPTIC    1   // small coin motor via MOSFET if you add it
