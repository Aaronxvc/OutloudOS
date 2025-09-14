#pragma once

// Board selector for our firmware.
// Define exactly ONE of these in build_flags:
//
//   -D BOARD_FLIP_C3=1     (XIAO ESP32-C3 Flip)
//   -D BOARD_WATCH_C3=1    (XIAO ESP32-C3 Watch)
//   -D BOARD_FLIP_S3=1     (ESP32-S3 DevKitC Flip proto)

#if defined(BOARD_FLIP_C3)
  #include "boards/flip_c3.hpp"
#elif defined(BOARD_WATCH_C3)
  #include "boards/watch_c3.hpp"
#elif defined(BOARD_FLIP_S3)
  #include "boards/flip_s3.hpp"
#else
  #error "No board selected. Define BOARD_FLIP_C3, BOARD_WATCH_C3, or BOARD_FLIP_S3 in build_flags."
#endif
