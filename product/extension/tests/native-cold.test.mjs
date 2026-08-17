import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../content/35-native-cold.js", import.meta.url),
  "utf8"
);

function createHarness() {
  const SegmentState = {
    HOT: "hot",
    WARM: "warm",
    COLD: "cold",
    PINNED: "pinned"
  };

  class SegmentController {
    constructor() {
      this.stats = {};
      this.published = 0;
    }

    applyState(segment, nextState) {
      segment.state = nextState;
      if (nextState === SegmentState.HOT || nextState === SegmentState.PINNED) {
        segment.node.style.setProperty("content-visibility", "visible", "important");
      } else {
        segment.node.style.setProperty("content-visibility", "auto", "important");
      }
    }

    restoreSegment(segment) {
      segment.node.style.removeProperty("content-visibility");
    }

    publishStats() {
      this.published += 1;
    }
  }

  const errors = [];
  const context = {
    console,
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    LongViewCore: { SegmentState },
    LongView: {
      SegmentController,
      reportError(error, phase) {
        errors.push({ error, phase });
      }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "35-native-cold.js" });
  return { SegmentController, SegmentState, errors };
}

function createSegment() {
  const properties = new Map();
  let nativeCount = 11;
  const node = {
    isConnected: true,
    style: {
      setProperty(name, value, priority = "") {
        properties.set(name, { value, priority });
      },
      removeProperty(name) {
        properties.delete(name);
      }
    },
    get offsetHeight() {
      nativeCount = 9;
      return 600;
    },
    longViewDetachDescendantLayoutObjects() {
      const detached = nativeCount;
      nativeCount = 0;
      return detached;
    },
    longViewCountDescendantLayoutObjects() {
      return nativeCount;
    }
  };
  return {
    segment: { node, height: 600, state: null },
    properties,
    setNativeCount(value) {
      nativeCount = value;
    }
  };
}

test("native COLD detaches and accounts descendant layout objects", () => {
  const { SegmentController, SegmentState, errors } = createHarness();
  const controller = new SegmentController();
  const { segment, properties } = createSegment();

  controller.applyState(segment, SegmentState.COLD, "test-cold");

  assert.equal(segment.nativeColdDetached, true);
  assert.equal(controller.stats.nativeColdAvailable, true);
  assert.equal(controller.stats.nativeColdSegments, 1);
  assert.equal(controller.stats.nativeColdTransitions, 1);
  assert.equal(controller.stats.nativeDetachedLayoutObjects, 11);
  assert.equal(properties.get("content-visibility").value, "hidden");
  assert.equal(errors.length, 0);
});

test("materialization records restored layout objects", () => {
  const { SegmentController, SegmentState, errors } = createHarness();
  const controller = new SegmentController();
  const { segment } = createSegment();

  controller.applyState(segment, SegmentState.COLD, "test-cold");
  controller.applyState(segment, SegmentState.HOT, "test-hot");

  assert.equal(segment.nativeColdDetached, false);
  assert.equal(controller.stats.nativeColdSegments, 0);
  assert.equal(controller.stats.nativeMaterializations, 1);
  assert.equal(controller.stats.nativeRestoredLayoutObjects, 9);
  assert.equal(errors.length, 0);
});

test("ordinary Chrome keeps the extension-only fallback", () => {
  const { SegmentController, SegmentState } = createHarness();
  const controller = new SegmentController();
  const properties = new Map();
  const segment = {
    height: 400,
    state: null,
    node: {
      isConnected: true,
      style: {
        setProperty(name, value, priority = "") {
          properties.set(name, { value, priority });
        },
        removeProperty(name) {
          properties.delete(name);
        }
      }
    }
  };

  controller.applyState(segment, SegmentState.COLD, "fallback");

  assert.equal(controller.stats.nativeColdAvailable, false);
  assert.equal(segment.nativeColdDetached, undefined);
  assert.equal(properties.get("content-visibility").value, "auto");
});
