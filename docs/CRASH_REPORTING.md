# Crash reporting

Chromium already uses Crashpad; LongView release builds configure it rather than introducing a second crash subsystem.

Required production behavior:

- disabled until opt-in;
- upload endpoint supplied at build/release time, never hard-coded with credentials;
- scrub URL-like command-line arguments and profile paths;
- retain local dumps for a bounded period;
- expose a UI to inspect, delete and disable reports;
- tag reports with LongView version, Chromium commit, enabled feature flags and crash-safe lifecycle counters.

Hosted CI validates configuration shape only. An actual upload service and its data-processing agreement are external deployment dependencies.
