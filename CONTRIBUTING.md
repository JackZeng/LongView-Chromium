# Contributing to LongView Chromium

LongView accepts benchmark fixtures, compatibility tests, diagnostics, site-boundary adapters, lifecycle policy improvements, Chromium-native experiments, and release tooling.

Before opening a change:

1. state the problem and expected measurable effect;
2. keep the patch narrowly scoped;
3. run all checks in `docs/DEVELOPMENT.md`;
4. include baseline and variant evidence for performance claims;
5. describe web-observable compatibility risks;
6. never commit Chromium checkout/build output or large traces.

Security-sensitive reports should follow `SECURITY.md` rather than a public issue.
