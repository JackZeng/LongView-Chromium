# LongView Chromium

**A Chromium-based desktop browser built for extremely long, dynamic web pages.**

LongView keeps the visible region fully interactive, prepares nearby content, and reduces rendering work for distant content. The first runnable release targets long AI conversations, documentation, logs, feeds, forums, notebooks, and large rendered Markdown pages.

## Current status

`v0.1.0` is a functional cross-platform browser MVP built on **Electron 43.2.0 / Chromium 150.0.7871.129**. It includes a complete browser shell and an application-layer HOT/WARM/COLD segment engine. A pinned native Chromium policy overlay is included for the next Blink integration stage.

This repository now contains working code rather than only an architecture proposal.

### Browser capabilities

- Multi-tab browsing with persistent sessions
- Address bar, URL normalization, and web search
- Back, forward, reload/stop, home, zoom, and developer tools
- History and bookmarks stored locally
- Find-in-page with safe temporary materialization of cold content
- Download progress
- Permission prompts for sensitive capabilities
- Internal new-tab, history, bookmarks, settings, and benchmark pages
- macOS and Windows packaging workflows

### LongView capabilities

- Explicit, ChatGPT-like, and conservative generic segment discovery
- HOT/WARM/COLD segment lifecycle
- Scroll-velocity prediction and asymmetric prewarming
- Binary-search selection of the relevant segment window, avoiding a full-page geometry walk on every scroll frame
- `content-visibility` and `contain-intrinsic-size` based off-screen reduction
- Compatibility, Balanced, and Aggressive modes
- Mutation and resize-aware rescanning
- Focus and selection pinning, plus materialization hooks for find, copy, before-match, and print operations
- Live segment, frame, long-task, DOM, memory, and velocity diagnostics
- Deterministic 100/500/1000/2000/5000-turn synthetic conversation benchmark
- Headless benchmark reports and baseline-vs-LongView comparison tooling

## Run the browser

Requirements:

- macOS or Windows for the primary desktop target
- Node.js 22 or newer
- npm

```bash
npm install
npm start
```

Open the built-in stress page from the LongView menu, or navigate to:

```text
longview://benchmark/?turns=1000
```

## Run tests

```bash
npm run check
```

The test suite validates navigation input handling, policy classification, binary search bounds, persistent storage, JSON files, and JavaScript syntax.

## Run reproducible benchmarks

```bash
npm run benchmark:baseline
npm run benchmark:longview
npm run benchmark:compare
```

Reports are written under `artifacts/`. The benchmark scrolls a deterministic ChatGPT-like page while the final assistant response continues streaming.

## Package the browser

Package for the current machine:

```bash
npm run package
```

Explicit targets:

```bash
npm run package:mac-arm64
npm run package:mac-x64
npm run package:win-x64
```

Unsigned application bundles are written to `dist/`. Public distribution still requires Apple/Windows code signing and notarization.

## LongView modes

| Mode | Behavior | Intended use |
|---|---|---|
| Compatibility | Uses conservative `content-visibility:auto` segmentation | Unknown or compatibility-sensitive sites |
| Balanced | Same web-compatible base with predictive HOT/WARM/COLD management | Default browsing mode |
| Aggressive | Distant segments use `content-visibility:hidden` and stronger containment | Static documents and controlled benchmark pages |

Aggressive mode can change script-observable geometry and animation behavior. It is deliberately opt-in.

## Architecture

```text
Electron / Chromium 150
├── Native browser window
│   ├── Trusted browser chrome WebContentsView
│   └── One isolated WebContentsView per tab
├── Browser services
│   ├── navigation, tabs, session restore
│   ├── history, bookmarks, downloads
│   ├── permissions and internal protocol
│   └── benchmark automation
└── LongView renderer preload
    ├── segment adapters
    ├── predictive policy
    ├── HOT/WARM/COLD lifecycle
    ├── materialization commands
    └── performance metrics
```

The renderer policy is also implemented as a dependency-light C++ kernel under `chromium_overlay/`. This lets the same semantics move into Blink without redesigning the policy during native integration.

## Pinned Chromium source

`chromium.version` pins:

```text
Electron        43.2.0
Chromium        150.0.7871.129
Chromium SHA    e69b30bba288603e514cffb4c79c359cac68e923
Node in Electron 24.18.0
V8              15.0.1240245
```

Create the native Chromium checkout:

```bash
python3 tools/bootstrap-chromium.py /path/to/chromium-workspace
python3 tools/install-overlay.py /path/to/chromium-workspace/src
```

See `docs/CHROMIUM_NATIVE_PLAN.md` before modifying Blink.

## Important implementation boundary

The desktop browser is runnable today, but the deepest optimization—discarding Blink layout/paint state for cold regions while preserving all web-observable behavior—requires native Chromium changes. The current implementation intentionally proves segmentation policy, product behavior, benchmarks, and compatibility boundaries before invasive LayoutNG work.

It therefore provides two things in one repository:

1. A usable LongView browser MVP that can already improve well-structured long pages.
2. A measured and pinned path toward a maintainable Chromium/Blink fork.

## Documentation

- `docs/BUILDING.md` — setup, run, package, and benchmark instructions
- `docs/IMPLEMENTATION_STATUS.md` — what is complete and what remains native work
- `docs/CHROMIUM_NATIVE_PLAN.md` — Blink integration sequence and invariants
- `docs/SECURITY.md` — process isolation, permissions, and known tradeoffs
- `docs/ARCHITECTURE.md` — original architecture direction
- `docs/BENCHMARKS.md` — performance measurement principles

## License

LongView-specific code is released under the BSD 3-Clause License. Electron, Chromium, and their third-party components retain their original licenses.
