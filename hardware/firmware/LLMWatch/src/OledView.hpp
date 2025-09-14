#pragma once
#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>

// Pins/address that worked in your probe
#ifndef OLED_SDA
#define OLED_SDA 8
#endif
#ifndef OLED_SCL
#define OLED_SCL 9
#endif
#ifndef OLED_ADDR
#define OLED_ADDR 0x3C
#endif

class OledView {
public:
  bool begin();
  void clear();
  void println(const String& s);
  void show();
  void statusPage(const char* title, const char* line1, const char* line2);

private:
  // SH1106 128x64 over I2C (full framebuffer)
  U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2{U8G2_R0, U8X8_PIN_NONE};
  int cursorY = 12;
};
