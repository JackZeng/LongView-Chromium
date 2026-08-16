# Product specification

## Product promise

LongView is a Chromium browser for pages whose content grows far beyond a normal viewport. The user should be able to continue a long AI conversation, inspect a large log, or read a huge document without scrolling cost growing in direct proportion to total page size.

## Initial users

- heavy ChatGPT, Claude, and Gemini users;
- developers reading large traces, logs, documentation, and notebooks;
- researchers testing browser working-set policies;
- operators using long feeds or dashboards.

## User-visible MVP

- standard native Chromium tabs and navigation;
- a LongView toolbar control;
- site/page enable switch;
- compatibility and aggressive modes;
- diagnostics for segment count, states, velocity, frame time, memory, and long tasks;
- deterministic built-in benchmark page through the repository fixture;
- unchanged site-owned DOM.

## Success criteria

The primary metric is not a single speedup. It is lower growth with page scale.

For 100 → 500 → 1000 → 2000 turn fixtures:

- LongView p95/p99 frame-time exponent should be lower than baseline;
- dropped-frame ratio should grow more slowly;
- layout/style/task duration should grow more slowly;
- no correctness probe may fail;
- no increase in blank/checkerboard behavior is acceptable;
- memory growth must be reported even if it is not yet improved.

## Compatibility strategy

Compatibility is the default. Unknown/high-risk content remains hot. Repeated materialization pins a segment instead of repeatedly faulting. Aggressive behavior is limited to controlled pages and experiments.

## Distribution boundary

A build can be called a LongView development browser after it is built from the pinned Chromium revision and launches with the LongView runtime.

It cannot be called production-ready until it has:

- platform code signing and notarization;
- an update channel tracking supported Chromium security releases;
- crash reporting and rollback;
- privacy review;
- macOS/Windows product testing;
- accessibility validation.
