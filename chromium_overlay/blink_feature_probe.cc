#include <iostream>

#include "third_party/blink/renderer/platform/runtime_enabled_features.h"

int main() {
  if (blink::RuntimeEnabledFeatures::LongViewSegmentLifecycleEnabled()) {
    std::cerr << "LongViewSegmentLifecycle must remain disabled by default.\n";
    return 1;
  }
  std::cout << "LongViewSegmentLifecycle default=disabled\n";
  return 0;
}
