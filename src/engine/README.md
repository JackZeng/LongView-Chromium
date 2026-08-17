# LongView engine core

This dependency-free C++20 library is the executable contract for Phases 3–6:

- document-scoped HOT/WARM/COLD/PINNED lifecycle;
- explicit materialization reasons;
- display-lock/cold-backend abstraction;
- geometry capsules that preserve document extent and anchors;
- anti-thrashing pinning;
- velocity-aware scheduler priorities;
- feature-off behavior that leaves every segment HOT.

`InMemoryColdBackend` is a deterministic test backend. A Chromium integration implements `ColdBackend` using Blink display-lock and derived-state ownership. The library intentionally does not pretend that standalone tests release real Blink `LayoutObject` or paint state.
