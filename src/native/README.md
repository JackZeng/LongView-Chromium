# Native lifecycle and eligibility model

This dependency-free C++20 library is the specification for LongView's native policy.

It implements:

- HOT/WARM/COLD/PINNED state classification;
- conservative eligibility decisions and exclusion reasons;
- direction/speed working sets;
- HOT/WARM demotion hysteresis;
- ordered segment indexing;
- materialization reason counters;
- anti-thrashing pinning.

Build:

```bash
cmake -S src/native -B build/native -DCMAKE_BUILD_TYPE=Release
cmake --build build/native --parallel 2
ctest --test-dir build/native --output-on-failure
```

The policy does not own Blink objects. `chromium_overlay/` mirrors the model into an independent Chromium GN target. Native engine integration remains gated behind `blink::features::kLongViewSegmentLifecycle`, which is disabled by default.
