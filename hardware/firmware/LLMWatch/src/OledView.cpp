#include "OledView.hpp"

bool OledView::begin() {
  Wire.begin(OLED_SDA, OLED_SCL);
  Wire.setClock(400000);
  u8g2.setI2CAddress(OLED_ADDR << 1); // U8g2 wants 8-bit address
  u8g2.begin();

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x12_tf);
  u8g2.drawStr(0, 12, "OLED: SH1106 OK");
  u8g2.sendBuffer();
  delay(250);

  cursorY = 12;
  return true;
}

void OledView::clear() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_6x12_tf);
  cursorY = 12;
}

void OledView::println(const String& s) {
  u8g2.drawStr(0, cursorY, s.c_str());
  cursorY += 12;
  if (cursorY > 62) cursorY = 12; // simple wrap
}

void OledView::show() { u8g2.sendBuffer(); }

void OledView::statusPage(const char* title, const char* line1, const char* line2) {
  clear();
  u8g2.drawStr(0, 12, title);
  u8g2.drawHLine(0, 14, 127);
  if (line1) u8g2.drawStr(0, 28, line1);
  if (line2) u8g2.drawStr(0, 42, line2);
  show();
}
