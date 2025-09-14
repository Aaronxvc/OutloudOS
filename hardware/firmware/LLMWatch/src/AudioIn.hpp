#pragma once
// Minimal I²S (RX) wrapper for ESP32-S3 using the ESP-IDF driver via Arduino core.
// Works with I²S MEMS mics (e.g., INMP441, SPH0645) in standard I²S (not PDM) mode.

#include <Arduino.h>
#include "driver/i2s.h"   // provided by Arduino-ESP32

class AudioIn {
public:
  struct Pins {
    int bclk;   // SCK
    int lrclk;  // WS  (aka L/R clock)
    int din;    // SD  (mic data to ESP32)
  };

  // Initialize I²S RX. Returns true on success.
  // Default 16 kHz mono, 32-bit samples from many I²S MEMS mics.
  bool begin(const Pins& p, uint32_t sampleRate = 16000) {
    _pins = p;

    // --- I²S driver config (legacy-compatible across Arduino-ESP32) ---
    i2s_config_t cfg{};
    cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
    cfg.sample_rate = (int)sampleRate;
    cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;   // many mics clock out 24 bits left-justified
    cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;    // mono (use LEFT channel)
    // Older/newer IDF variants differ on this flag set; the OR below keeps it portable
    cfg.communication_format = (i2s_comm_format_t)(I2S_COMM_FORMAT_I2S | I2S_COMM_FORMAT_I2S_MSB);
    cfg.intr_alloc_flags = 0;          // default IRQ
    cfg.dma_buf_count = 4;             // number of DMA buffers
    cfg.dma_buf_len = 256;             // samples per buffer
    cfg.use_apll = false;              // standard PLL is fine
    cfg.tx_desc_auto_clear = false;    // RX only
    cfg.fixed_mclk = 0;

    // Install I²S driver on port 0
    esp_err_t err = i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr);
    if (err != ESP_OK) {
      _ok = false;
      return false;
    }

    // Pin mapping
    i2s_pin_config_t pins{};
    pins.bck_io_num = _pins.bclk;
    pins.ws_io_num  = _pins.lrclk;
    pins.data_out_num = -1;            // we don't transmit
    pins.data_in_num  = _pins.din;

    err = i2s_set_pin(I2S_NUM_0, &pins);
    if (err != ESP_OK) {
      _ok = false;
      return false;
    }

    // Set clock explicitly (sample rate, bit depth, mono)
    err = i2s_set_clk(I2S_NUM_0, sampleRate, I2S_BITS_PER_SAMPLE_32BIT, I2S_CHANNEL_MONO);
    _ok = (err == ESP_OK);
    return _ok;
  }

  // Non-blocking poll: read whatever is available (up to maxBytes),
  // count frames, and return "new frames read this call".
  size_t poll(size_t maxBytes = 2048) {
    if (!_ok) return 0;

    // Reuse a small static buffer to avoid heap churn.
    static uint8_t buf[4096];
    maxBytes = min(maxBytes, sizeof(buf));

    size_t bytesRead = 0;
    // Timeout 0 = non-blocking; driver returns immediately with what’s ready.
    i2s_read(I2S_NUM_0, buf, maxBytes, &bytesRead, 0);

    // Each mono frame = 4 bytes (32-bit). Defensive divide.
    size_t frames = bytesRead / 4;
    _totalFrames += frames;
    return frames;
  }

  uint64_t totalFrames() const { return _totalFrames; }
  bool ok() const { return _ok; }

private:
  Pins _pins{5, 6, 7};   // defaults; can be overridden in begin()
  bool _ok = false;
  uint64_t _totalFrames = 0;
};
