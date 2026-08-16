# LongView source

LongView-specific source that is independent of the large Chromium checkout lives here.

- `native/`: dependency-free C++20 implementation of the segment working-set and lifecycle policy. It is executable documentation for the future Blink implementation and is compiled on Linux, macOS and Windows CI.

The browser runtime currently lives in `product/extension/` because v0.1 is the measurement-first phase. Chromium-native code will be introduced as small, auditable patches only after benchmarks identify costs that the runtime layer cannot remove.
