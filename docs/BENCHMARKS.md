# Benchmark Specification

## Why benchmarks come first

Long-page performance has multiple bottlenecks. A visually smoother result can hide increased memory, delayed input, checkerboarding, or broken web behavior. Every architectural claim therefore needs a reproducible benchmark.

## Required workloads

### A. Static Markdown

Repeated headings, paragraphs, lists, tables, block quotes, and code blocks.

Target scales:

- 1,000 DOM nodes
- 10,000 DOM nodes
- 100,000 DOM nodes
- 500,000 DOM nodes when hardware permits

### B. Conversation feed

Synthetic ChatGPT-like turns with:

- Markdown text;
- code blocks;
- tables;
- buttons/toolbars;
- optional images;
- streaming append behavior.

Target scales:

- 100 turns
- 500 turns
- 1,000 turns
- 2,000 turns

### C. Dynamic stress

While scrolling history:

- append tokens to the latest turn;
- mutate one distant segment at controlled intervals;
- run bounded JavaScript long tasks;
- trigger observer callbacks.

### D. Correctness probes

For cold/off-screen content test:

- `getBoundingClientRect()`;
- `offsetHeight` / `offsetTop`;
- `scrollIntoView()`;
- find-in-page;
- anchor navigation;
- focus/tab order;
- text selection and copy;
- accessibility traversal;
- screenshot;
- printing;
- DOM mutation.

## Metrics

Capture at minimum:

- p50 / p95 / p99 frame time while scrolling;
- dropped/stuttered frame ratio;
- renderer main-thread busy time;
- style recalculation time;
- layout time;
- paint time;
- raster work;
- compositor timing;
- renderer RSS/private memory;
- JavaScript heap;
- DOM node count;
- layout object count where available;
- GPU/tile memory where available;
- GC pause/activity;
- time-to-first-scrollable-content;
- materialization latency for cold content.

## Experimental controls

Each result must record:

```text
LongView commit SHA
Chromium upstream SHA
OS + version
CPU
RAM
GPU
Display refresh rate
Power mode
Browser command line / flags
Warm-up count
Run count
Fixture identifier + scale
```

Where possible, disable unrelated sources of nondeterminism and use the same machine for baseline and treatment.

## Primary success criterion

As total document size grows, scroll cost should approach dependence on the active viewport working set rather than total page complexity.

A useful visualization is:

```text
x-axis: total segment count
y-axis: p95/p99 scroll frame time
```

The LongView curve should be materially flatter than baseline Chromium.

## Guardrails

A performance win is rejected if it materially breaks:

- visual correctness;
- input responsiveness;
- scrolling geometry;
- script-observable layout behavior;
- focus/selection;
- find-in-page;
- accessibility;
- screenshots or printing;
- normal media behavior.
