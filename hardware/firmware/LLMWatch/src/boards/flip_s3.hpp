#pragma once
#include <Arduino.h>

// -------- Device name (can be overridden by build flag) --------
#ifndef DEVICE_NAME
#define DEVICE_NAME "LLM Flip v0 (S3)"
#endif

// -------- I2C pins (override via build flags if you prefer) ----
#ifndef OLED_SDA
#define OLED_SDA 8   // GPIO 8 on S3 DevKitC
#endif
#ifndef OLED_SCL
#define OLED_SCL 9   // GPIO 9 on S3 DevKitC
#endif
#ifndef OLED_ADDR
#define OLED_ADDR 0x3C
#endif

// -------- Buttons (internal pull-ups) --------------------------
#ifndef BTN_A
#define BTN_A 3      // GPIO 3
#endif
#ifndef BTN_B
#define BTN_B 4      // GPIO 4
#endif

// -------- Optional features -----------------------------------
#ifndef FEAT_REED_LID
#define FEAT_REED_LID 0
#endif
