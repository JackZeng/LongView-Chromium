# Blink engine bridge

The policy layer must not directly own Blink objects. `BlinkColdBackend` is the narrow integration seam between the tested LongView controller and an eventual document-scoped Blink owner.

The Blink owner implements `DerivedStateDelegate` and is responsible for:

1. proving a segment is eligible and display-lock safe;
2. materializing before any observable operation;
3. preserving DOM identity, scroll geometry, anchors, focus, selection, accessibility, screenshot and print behavior;
4. releasing only derived state that Blink can recreate deterministically;
5. returning measured byte estimates and trace events;
6. refusing a freeze when invariants are not satisfied.

`tools/longview.py install-overlay` now installs the engine contract into `//longview/engine`. The pinned Chromium native probe must compile and execute:

```text
//longview:segment_policy_test
//longview:engine_contract_test
//longview:blink_bridge_test
//longview:blink_feature_probe
```

The bridge is deliberately disabled until a full Chromium patch wires a document owner to existing display-lock/content-visibility machinery. A successful bridge unit test does not, by itself, claim that Blink layout or paint state has been released.
