# Benchmarks

This directory will contain deterministic fixtures and runners for pathological long-page workloads.

Planned structure:

```text
benchmarks/
├── fixtures/
│   ├── static-markdown/
│   ├── conversation-feed/
│   └── dynamic-stress/
├── runner/
└── expectations/
```

Do not commit large trace output here. Generated traces/results belong in ignored local output directories or attached CI artifacts.

See `docs/BENCHMARKS.md` for the measurement contract.
