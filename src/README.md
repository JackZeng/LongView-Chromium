# LongView source

`src/native/` contains a dependency-free C++20 model for lifecycle policy, eligibility, indexing, materialization telemetry, and anti-thrashing behavior.

The same sources are mirrored into `chromium_overlay/longview/common/` so they can be built by Chromium's GN toolchain as `//longview:segment_policy_test`.

This model is a policy specification and parity oracle. It is not evidence that Blink has released layout or paint state.
