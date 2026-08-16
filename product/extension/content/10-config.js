(function installConfiguration(global) {
  "use strict";

  const LV = global.LongView;
  const Core = global.LongViewCore;

  const DEFAULT_SETTINGS = Object.freeze(Core.normalizeSettings());

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "longview:get-settings" });
      return Core.normalizeSettings(response?.settings || DEFAULT_SETTINGS);
    } catch (error) {
      LV.reportError(error, "load-settings");
      return Core.normalizeSettings(DEFAULT_SETTINGS);
    }
  }

  function isHostExcluded(settings, hostname = location.hostname) {
    return settings.excludedHosts.some((pattern) => Core.hostMatches(hostname, pattern));
  }

  function pageLooksRisky() {
    const documentEditor = document.body?.isContentEditable || Boolean(
      document.querySelector('.monaco-editor, .CodeMirror, [data-editor-root="true"], [data-slate-editor="true"]')
    );
    const canvasCount = document.querySelectorAll("canvas").length;
    const activeFullscreen = Boolean(document.fullscreenElement);
    return Boolean(documentEditor || canvasCount > 12 || activeFullscreen);
  }

  LV.config = {
    DEFAULT_SETTINGS,
    loadSettings,
    isHostExcluded,
    pageLooksRisky
  };
})(globalThis);
