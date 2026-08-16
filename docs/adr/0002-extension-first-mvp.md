# ADR 0002: Use a native Chromium build with an extension-first lifecycle prototype

## Status

Accepted for v0.1–v0.2.

## Context

Deep Blink changes are expensive and compatibility-sensitive. The project needs a runnable browser, deterministic workloads, and policy evidence before it can safely change LayoutNG, paint, accessibility, or compositor behavior.

## Decision

Build the browser from pinned Chromium and load a LongView Manifest V3 runtime into that native browser. Mirror the lifecycle policy in dependency-free C++ and install it as an independent `//longview` GN target.

## Consequences

Positive:

- real native Chromium executable;
- fast policy iteration;
- baseline and LongView use the same browser binary;
- site adapters and product controls can be validated early;
- the C++ model can become a parity oracle for Blink work.

Limitations:

- retains DOM and most layout/accessibility state;
- cannot independently own compositor scrolling;
- cannot prove geometry-capsule feasibility;
- real LongView extension runs require headed Chromium (or a virtual display), not pure headless mode;
- extension injection can add its own main-thread cost.

## Revisit

After Phase 2 evidence and Phase 3 observability tests are available.
