(function bootstrapLongView(global) {
  "use strict";

  const LV = global.LongView;
  let activationObserver = null;
  let activationTimer = 0;
  let pageOverride = null;

  function pageScreens() {
    const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    return scrollHeight / Math.max(1, innerHeight);
  }

  function shouldActivate(settings, { force = false } = {}) {
    if (pageOverride === false && !force) return { ok: false, reason: "page-disabled" };
    if (!force && (!settings.enabled || LV.config.isHostExcluded(settings))) {
      return { ok: false, reason: "disabled-or-excluded" };
    }

    const screens = pageScreens();
    let domNodes = null;
    if (!force && screens < settings.minimumPageScreens) {
      domNodes = document.getElementsByTagName("*").length;
      if (domNodes < settings.minimumDomNodes) {
        return { ok: false, reason: "below-threshold", scale: { screens, domNodes } };
      }
    }

    const scale = { screens, domNodes };
    if (!force && settings.mode === "conservative" && LV.config.pageLooksRisky()) {
      return { ok: false, reason: "risky-page", scale };
    }
    return { ok: true, reason: force ? "forced" : "threshold-met", scale };
  }

  async function activate(reason = "bootstrap", { force = false } = {}) {
    if (LV.state.controller) return true;
    const settings = LV.state.settings || await LV.config.loadSettings();
    LV.state.settings = settings;
    const decision = shouldActivate(settings, { force });
    if (!decision.ok) {
      LV.log("Not activating", decision);
      return false;
    }

    const discovery = LV.adapters.discover(settings);
    if (!discovery || discovery.nodes.length < settings.minimumSegments) {
      LV.log("No suitable segment root", { reason, discovery });
      return false;
    }

    LV.state.adapter = discovery.adapterId;
    LV.state.diagnostics ||= new LV.DiagnosticsOverlay(settings.showDiagnostics);
    const controller = new LV.SegmentController(discovery, settings);
    LV.state.controller = controller;
    const started = controller.start();
    if (!started) LV.state.controller = null;
    else LV.log("Activated", { reason, adapter: discovery.adapterId, segments: controller.segments.length });
    return started;
  }

  function stopActivationWatch() {
    clearTimeout(activationTimer);
    activationObserver?.disconnect();
    activationObserver = null;
  }

  function deactivate(reason = "manual") {
    LV.state.controller?.destroy(reason);
    LV.state.controller = null;
    LV.state.diagnostics?.render({ active: false, lastReason: reason });
  }

  function watchForActivation() {
    if (activationObserver || pageOverride === false) return;
    activationObserver = new MutationObserver(() => {
      clearTimeout(activationTimer);
      activationTimer = setTimeout(async () => {
        if (pageOverride === false) return;
        if (await activate("page-growth", { force: pageOverride === true })) stopActivationWatch();
      }, 800);
    });
    activationObserver.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(stopActivationWatch, 120_000);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return undefined;
    if (message.type === "longview:get-status") {
      const stats = LV.state.controller?.snapshot() || { active: false, lastReason: "not-active" };
      sendResponse({ stats: { ...stats, pageOverride } });
      return true;
    }
    if (message.type === "longview:set-enabled") {
      pageOverride = Boolean(message.enabled);
      if (pageOverride) {
        activate("user-enabled", { force: true }).then((active) => {
          if (!active) watchForActivation();
          sendResponse({ active });
        });
      } else {
        stopActivationWatch();
        deactivate("user-disabled");
        sendResponse({ active: false });
      }
      return true;
    }
    if (message.type === "longview:settings-changed") {
      LV.state.settings = global.LongViewCore.normalizeSettings(message.settings);
      LV.state.diagnostics?.setVisible(LV.state.settings.showDiagnostics);
      const decision = shouldActivate(LV.state.settings, { force: pageOverride === true });
      if (!decision.ok) {
        deactivate(`settings-${decision.reason}`);
        if (pageOverride !== false) watchForActivation();
      } else if (LV.state.controller) {
        LV.state.controller.setSettings(LV.state.settings);
      } else {
        activate("settings-changed", { force: pageOverride === true }).then((active) => {
          if (!active) watchForActivation();
        });
      }
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "longview:toggle-diagnostics") {
      LV.state.diagnostics ||= new LV.DiagnosticsOverlay(false);
      LV.state.diagnostics.setVisible(message.visible ?? !LV.state.diagnostics.visible);
      sendResponse({ visible: LV.state.diagnostics.visible });
      return true;
    }
    if (message.type === "longview:force-reindex") {
      LV.state.controller?.scheduleRediscovery("manual-reindex", 0);
      sendResponse({ ok: Boolean(LV.state.controller) });
      return true;
    }
    return undefined;
  });

  async function main() {
    try {
      LV.state.settings = await LV.config.loadSettings();
      LV.state.diagnostics = new LV.DiagnosticsOverlay(LV.state.settings.showDiagnostics);
      if (!(await activate("initial-load"))) watchForActivation();
    } catch (error) {
      LV.reportError(error, "bootstrap");
    }
  }

  setTimeout(main, 250);
})(globalThis);
