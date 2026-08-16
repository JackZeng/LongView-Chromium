# Chromium integration / patch series

This directory documents and, where appropriate, stores the auditable LongView delta against the pinned Chromium upstream revision.

Rules:

1. Every engine patch must state its target Chromium upstream SHA/revision range.
2. Performance patches should reference benchmark evidence.
3. Avoid unrelated browser branding or product UI changes in rendering patches.
4. Prefer small changes that can plausibly be reasoned about and tested independently.
5. Rebase deliberately; never silently refresh patches onto a new Chromium revision and compare the result against an old baseline.
