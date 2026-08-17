# Privacy model

LongView's long-page lifecycle operates locally. Page text, conversation content, geometry capsules and benchmark traces are not uploaded by default.

## Default telemetry

- no page-content telemetry;
- no browsing-history telemetry;
- no advertising identifier;
- no automatic crash upload without explicit user consent;
- performance counters are aggregated and contain segment counts/timings, not text.

## Crash reports

Crashpad support must use an explicit opt-in screen. Before upload, the product removes command-line URLs, profile paths and annotations that can contain page identifiers. Local crash dumps remain user-deletable. Enterprise policy may disable crash collection entirely.

## Update checks

The updater sends only product, channel, version, platform and architecture. Staged rollout uses a locally generated random machine identifier that is never transmitted.
