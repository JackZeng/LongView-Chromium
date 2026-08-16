# Native segment model

This small dependency-free C++ library is the executable specification for the future Blink-native lifecycle. It defines:

- HOT/WARM/COLD/PINNED states;
- velocity-aware working-set prediction;
- segment classification;
- materialization reasons;
- anti-thrashing promotion after repeated off-screen access.

It deliberately has no Chromium headers so the policy can be unit-tested quickly before it is transplanted into Blink. It is not yet wired into Chromium's renderer lifecycle.

```bash
cmake -S src/native -B build/native
cmake --build build/native
ctest --test-dir build/native --output-on-failure
```
