(function initializeNamespace(global) {
  "use strict";

  const existing = global.LongView || {};
  const state = existing.state || {
    controller: null,
    diagnostics: null,
    settings: null,
    adapter: null,
    startedAt: performance.now(),
    lastError: null
  };

  function log(...args) {
    if (state.settings?.showDiagnostics) {
      console.debug("[LongView]", ...args);
    }
  }

  function reportError(error, context = "unknown") {
    state.lastError = {
      context,
      message: error instanceof Error ? error.message : String(error),
      at: Date.now()
    };
    console.warn(`[LongView] ${context}:`, error);
  }

  global.LongView = {
    ...existing,
    state,
    log,
    reportError,
    version: "0.3.0"
  };
})(globalThis);
