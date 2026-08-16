# Implementation status

## Meaning of “browser” in v0.1

LongView v0.1 is a reproducible Chromium distribution with a browser-loaded LongView runtime, not a reskinned Electron shell. The executable is built from the pinned Chromium source, uses Chromium's multiprocess architecture, Blink, V8, Skia, compositor, sandbox, and normal browser UI.

The optimization module is initially delivered as a Manifest V3 runtime because this permits fast, measurable iteration against real sites without carrying an unverified invasive fork. The same policy is represented in dependency-free C++ for migration into Blink.

## Complete in v0.1

| Area | Status | Notes |
|---|---:|---|
| Exact Chromium pin | Complete | Stable tag and 40-character SHA recorded |
| Cross-platform bootstrap CLI | Complete | Fetch, sync, build, run, package, benchmark |
| Long-page activation | Complete | Height or DOM threshold with site exclusions |
| Site adapters | Complete | ChatGPT, Claude, Gemini, generic repeated-content |
| Segment lifecycle | Complete | HOT, WARM, COLD, PINNED |
| Predictive warming | Complete | Velocity and direction affect future working set |
| Scroll-time indexing | Complete | Sorted geometry plus binary range lookup |
| Warm-set bound | Complete | Prevents a huge working set on tiny repeated rows |
| Search/focus/selection compatibility | Complete | Materializes and temporarily pins relevant segment |
| Streaming/dynamic content | Complete | Mutation rediscovery and warm-range resize observation |
| Conservative/aggressive modes | Complete | Aggressive mode pauses animations in cold content |
| Diagnostics and settings | Complete | Popup, options, overlay, commands, badge |
| Synthetic long-page benchmark | Complete | 10–5000 turns and dynamic stressors |
| Automated runner | Complete | JSON output and baseline comparison |
| Native lifecycle model | Complete | C++20 library and tests |
| Repository CI | Complete | JS, Python, manifest, and C++ validation |

## Deliberately not claimed in v0.1

| Native capability | Why it is not claimed yet |
|---|---|
| Releasing site DOM/JS objects | Removing framework-owned nodes changes observable identity and state |
| Releasing all cold layout objects | Requires Blink lifecycle integration and exact compatibility semantics |
| Compact geometry capsules inside LayoutNG | Needs measured evidence that retained layout state is the next dominant cost |
| Compositor-owned virtual scroll tree | Requires cc/Blink coordination and checkerboarding tests |
| Compressed cold accessibility tree | Must preserve screen-reader navigation and find semantics |
| Transparent interception of every geometry API | Requires engine-owned materialization gates |
| Production updater/signing/notarization | Distribution operations, not the performance proof milestone |

## Expected v0.1 benefit

The runtime can reduce rendering work for well-segmented off-screen content because Chromium may skip style/layout/paint work beneath `content-visibility:auto` subtrees. The size of the benefit depends on page structure and on how much cost remains in JavaScript, retained DOM, observers, accessibility, and site framework reconciliation.

No fixed speedup percentage is asserted until the same pinned binary is measured on target macOS and Windows hardware.

## Exit criterion for Blink-native work

Move a mechanism into Blink only when the benchmark shows a retained cost that the extension/runtime layer cannot remove, and when a compatibility test specifies what materialization must happen for every observable operation.
