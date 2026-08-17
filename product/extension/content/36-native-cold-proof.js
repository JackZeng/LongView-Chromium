(function installNativeColdProofBridge(global) {
  "use strict";

  const Controller = global.LongView?.SegmentController;
  if (!Controller || Controller.prototype.__longViewNativeProofInstalled) return;

  const prototype = Controller.prototype;
  const originalApplyState = prototype.applyState;
  const originalRestoreSegment = prototype.restoreSegment;

  prototype.applyState = function applyStateWithProof(segment, nextState, reason) {
    originalApplyState.call(this, segment, nextState, reason);
    const node = segment?.node;
    if (!node?.dataset) return;
    if (segment.nativeColdDetached) {
      node.dataset.longviewNativeCold = "true";
      node.dataset.longviewNativeDetached = String(
        Number(segment.nativeDetachedLayoutObjects) || 0
      );
    } else if (node.dataset.longviewNativeCold === "true") {
      node.dataset.longviewNativeCold = "false";
    }
  };

  prototype.restoreSegment = function restoreSegmentWithProof(segment) {
    originalRestoreSegment.call(this, segment);
    if (segment?.node?.dataset) segment.node.dataset.longviewNativeCold = "false";
  };

  Object.defineProperty(prototype, "__longViewNativeProofInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
})(globalThis);
