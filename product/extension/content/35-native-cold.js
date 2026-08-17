(function installNativeColdBridge(global) {
  "use strict";

  const LV = global.LongView;
  const Core = global.LongViewCore;
  const Controller = LV?.SegmentController;
  if (!Controller || Controller.prototype.__longViewNativeColdInstalled) return;

  const { SegmentState } = Core;
  const prototype = Controller.prototype;
  const originalApplyState = prototype.applyState;
  const originalRestoreSegment = prototype.restoreSegment;

  function nativeAvailable(node) {
    return Boolean(
      node &&
      typeof node.longViewDetachDescendantLayoutObjects === "function" &&
      typeof node.longViewCountDescendantLayoutObjects === "function"
    );
  }

  function initializeStats(controller) {
    const stats = controller.stats;
    if (!("nativeColdAvailable" in stats)) stats.nativeColdAvailable = false;
    if (!("nativeColdSegments" in stats)) stats.nativeColdSegments = 0;
    if (!("nativeColdTransitions" in stats)) stats.nativeColdTransitions = 0;
    if (!("nativeMaterializations" in stats)) stats.nativeMaterializations = 0;
    if (!("nativeDetachedLayoutObjects" in stats)) stats.nativeDetachedLayoutObjects = 0;
    if (!("nativeRestoredLayoutObjects" in stats)) stats.nativeRestoredLayoutObjects = 0;
    if (!("nativeDetachFailures" in stats)) stats.nativeDetachFailures = 0;
  }

  function requestRestorationProbe(controller, segment) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!segment.node?.isConnected || !nativeAvailable(segment.node)) return;
        try {
          // A geometry read advances style/layout so force-reattach flags are
          // consumed before the native count is sampled.
          void segment.node.offsetHeight;
          const restored = Number(segment.node.longViewCountDescendantLayoutObjects()) || 0;
          controller.stats.nativeRestoredLayoutObjects += restored;
          controller.publishStats(false);
        } catch (error) {
          controller.stats.nativeDetachFailures += 1;
          LV.reportError(error, "native-cold-restoration-probe");
        }
      });
    });
  }

  prototype.applyState = function applyStateWithNativeCold(segment, nextState, reason) {
    initializeStats(this);
    const node = segment?.node;
    const hasNative = nativeAvailable(node);
    this.stats.nativeColdAvailable ||= hasNative;

    const wasNativeCold = Boolean(segment?.nativeColdDetached);

    // Let the existing controller update bookkeeping and containment first.
    originalApplyState.call(this, segment, nextState, reason);

    if (!hasNative || !segment || !node.isConnected) return;

    if (nextState === SegmentState.COLD) {
      if (wasNativeCold) return;
      try {
        // Unlike the extension-only fallback, native COLD is deterministic:
        // preserve the segment's outer geometry, hide its contents, then ask
        // Blink to destroy descendant LayoutObjects while marking them for
        // reattachment on materialization.
        node.style.setProperty("content-visibility", "hidden", "important");
        node.style.setProperty(
          "contain-intrinsic-block-size",
          `auto ${Math.ceil(segment.height)}px`,
          "important"
        );
        const detached = Number(node.longViewDetachDescendantLayoutObjects()) || 0;
        segment.nativeColdDetached = true;
        segment.nativeDetachedLayoutObjects = detached;
        this.stats.nativeColdSegments += 1;
        this.stats.nativeColdTransitions += 1;
        this.stats.nativeDetachedLayoutObjects += detached;
      } catch (error) {
        this.stats.nativeDetachFailures += 1;
        segment.nativeColdDetached = false;
        LV.reportError(error, "native-cold-detach");
      }
      return;
    }

    if (wasNativeCold) {
      segment.nativeColdDetached = false;
      this.stats.nativeColdSegments = Math.max(0, this.stats.nativeColdSegments - 1);
      this.stats.nativeMaterializations += 1;
      // HOT/PINNED are already visible; WARM is content-visibility:auto.
      // Both transitions cause Blink to consume the reattach marker.
      requestRestorationProbe(this, segment);
    }
  };

  prototype.restoreSegment = function restoreSegmentWithNativeCold(segment) {
    initializeStats(this);
    const wasNativeCold = Boolean(segment?.nativeColdDetached);
    originalRestoreSegment.call(this, segment);
    if (!wasNativeCold) return;
    segment.nativeColdDetached = false;
    this.stats.nativeColdSegments = Math.max(0, this.stats.nativeColdSegments - 1);
    this.stats.nativeMaterializations += 1;
    requestRestorationProbe(this, segment);
  };

  Object.defineProperty(prototype, "__longViewNativeColdInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
})(globalThis);
