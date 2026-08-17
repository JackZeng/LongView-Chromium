# Accessibility contract

Accessibility correctness overrides cold-state savings.

A segment is PINNED or materialized when it contains accessibility focus, participates in active traversal, exposes a live region, owns an open dialog/popover, or is requested by the accessibility tree. Find, focus, selection, anchors, screenshot and print receive the same correctness priority.

Release gates include keyboard-only navigation, visible focus, screen-reader traversal on macOS and Windows, 200% zoom, reduced motion, high contrast, and no loss of semantic text while a segment is COLD.
