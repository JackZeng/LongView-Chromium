'use strict';

const path = require('node:path');
const { Menu, WebContentsView, shell } = require('electron');
const { displayUrl, isInternalUrl, isWebNavigation, normalizeNavigationInput } = require('./url.cjs');

const CONTENT_BACKGROUND = '#ffffff';

class TabManager {
  constructor(options) {
    this.window = options.window;
    this.appRoot = options.appRoot;
    this.getSettings = options.getSettings;
    this.onStateChanged = options.onStateChanged || (() => {});
    this.onHistory = options.onHistory || (() => {});
    this.onMetrics = options.onMetrics || (() => {});
    this.onInternalDataChanged = options.onInternalDataChanged || (() => {});
    this.tabs = new Map();
    this.activeTabId = null;
    this.nextTabId = 1;
    this.contentBounds = { x: 0, y: 92, width: 1200, height: 708 };
  }

  createTab(input = 'longview://newtab/', options = {}) {
    const id = this.nextTabId++;
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(this.appRoot, 'src', 'preload', 'page-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: true,
        backgroundThrottling: true,
        partition: 'persist:longview'
      }
    });
    view.setBackgroundColor(CONTENT_BACKGROUND);

    const tab = {
      id,
      view,
      title: 'New Tab',
      url: 'longview://newtab/',
      loading: false,
      favicon: null,
      crashed: false,
      metrics: null,
      targetUrl: null
    };
    this.tabs.set(id, tab);
    this.bindTab(tab);

    if (options.activate !== false || this.activeTabId === null) this.activateTab(id);
    this.navigate(id, input);
    this.emitState();
    return id;
  }

  bindTab(tab) {
    const webContents = tab.view.webContents;

    webContents.on('page-title-updated', (event, title) => {
      event.preventDefault();
      tab.title = String(title || tab.url || 'New Tab').slice(0, 300);
      this.emitState();
    });

    webContents.on('did-start-loading', () => {
      tab.loading = true;
      tab.crashed = false;
      this.emitState();
    });

    webContents.on('did-stop-loading', () => {
      tab.loading = false;
      this.emitState();
    });

    const recordNavigation = (_event, url) => {
      tab.url = url;
      tab.crashed = false;
      this.onHistory({ url, title: tab.title, visitedAt: Date.now() });
      this.emitState();
    };
    webContents.on('did-navigate', recordNavigation);
    webContents.on('did-navigate-in-page', recordNavigation);

    webContents.on('page-favicon-updated', (_event, favicons) => {
      tab.favicon = Array.isArray(favicons) && favicons.length ? favicons[0] : null;
      this.emitState();
    });

    webContents.on('update-target-url', (_event, url) => {
      tab.targetUrl = url || null;
      this.emitState();
    });

    webContents.on('render-process-gone', (_event, details) => {
      tab.crashed = true;
      tab.loading = false;
      tab.title = `Renderer ${details.reason || 'stopped'}`;
      this.emitState();
    });

    webContents.on('unresponsive', () => {
      tab.title = `${tab.title.replace(/ \(Not responding\)$/, '')} (Not responding)`;
      this.emitState();
    });

    webContents.on('responsive', () => {
      tab.title = tab.title.replace(/ \(Not responding\)$/, '');
      this.emitState();
    });

    webContents.on('will-navigate', (event, url) => {
      if (isWebNavigation(url)) return;
      event.preventDefault();
      if (/^(mailto|tel):/i.test(url)) shell.openExternal(url).catch(() => {});
    });

    webContents.setWindowOpenHandler(({ url }) => {
      if (isWebNavigation(url)) this.createTab(url, { activate: true });
      else if (/^(mailto|tel):/i.test(url)) shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });

    webContents.on('context-menu', (_event, params) => {
      const items = [];
      if (params.isEditable) {
        items.push(
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        );
      } else {
        if (params.selectionText) items.push({ role: 'copy' }, { type: 'separator' });
        items.push(
          { label: 'Back', enabled: this.canGoBack(tab.id), click: () => this.goBack(tab.id) },
          { label: 'Forward', enabled: this.canGoForward(tab.id), click: () => this.goForward(tab.id) },
          { label: 'Reload', click: () => this.reload(tab.id) },
          { type: 'separator' }
        );
        if (params.linkURL) {
          items.push({ label: 'Open link in new tab', click: () => this.createTab(params.linkURL) });
        }
        items.push({ label: 'Inspect element', click: () => webContents.inspectElement(params.x, params.y) });
      }
      Menu.buildFromTemplate(items).popup();
    });

    webContents.on('found-in-page', (_event, result) => {
      if (tab.id === this.activeTabId) this.onStateChanged({ type: 'find', result });
    });
  }

  normalize(input) {
    return normalizeNavigationInput(input, { searchTemplate: this.getSettings().searchTemplate });
  }

  navigate(id, input) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const url = this.normalize(input);
    tab.url = url;
    tab.loading = true;
    tab.view.webContents.loadURL(url).catch((error) => {
      tab.loading = false;
      tab.title = 'Unable to load page';
      tab.crashed = false;
      tab.loadError = error.message;
      this.emitState();
    });
    this.emitState();
  }

  navigateActive(input) {
    if (this.activeTabId !== null) this.navigate(this.activeTabId, input);
  }

  activateTab(id) {
    const tab = this.tabs.get(id);
    if (!tab || id === this.activeTabId) return;
    const previous = this.tabs.get(this.activeTabId);
    if (previous) {
      try { this.window.contentView.removeChildView(previous.view); } catch {}
    }
    this.activeTabId = id;
    this.window.contentView.addChildView(tab.view);
    tab.view.setBounds(this.contentBounds);
    tab.view.webContents.focus();
    this.emitState();
  }

  closeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const ids = [...this.tabs.keys()];
    const index = ids.indexOf(id);
    const wasActive = id === this.activeTabId;
    if (wasActive) {
      try { this.window.contentView.removeChildView(tab.view); } catch {}
    }
    tab.view.webContents.close();
    this.tabs.delete(id);

    if (!this.tabs.size) {
      this.activeTabId = null;
      this.createTab('longview://newtab/');
      return;
    }

    if (wasActive) {
      const remaining = [...this.tabs.keys()];
      const next = remaining[Math.min(index, remaining.length - 1)];
      this.activeTabId = null;
      this.activateTab(next);
    }
    this.emitState();
  }

  closeActiveTab() {
    if (this.activeTabId !== null) this.closeTab(this.activeTabId);
  }

  layout(bounds) {
    this.contentBounds = { ...bounds };
    const active = this.tabs.get(this.activeTabId);
    if (active) active.view.setBounds(this.contentBounds);
  }

  activeTab() {
    return this.tabs.get(this.activeTabId) || null;
  }

  canGoBack(id = this.activeTabId) {
    const tab = this.tabs.get(id);
    return Boolean(tab?.view.webContents.navigationHistory.canGoBack());
  }

  canGoForward(id = this.activeTabId) {
    const tab = this.tabs.get(id);
    return Boolean(tab?.view.webContents.navigationHistory.canGoForward());
  }

  goBack(id = this.activeTabId) {
    const tab = this.tabs.get(id);
    if (tab && this.canGoBack(id)) tab.view.webContents.navigationHistory.goBack();
  }

  goForward(id = this.activeTabId) {
    const tab = this.tabs.get(id);
    if (tab && this.canGoForward(id)) tab.view.webContents.navigationHistory.goForward();
  }

  reload(id = this.activeTabId, ignoreCache = false) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    if (tab.loading) tab.view.webContents.stop();
    else if (ignoreCache) tab.view.webContents.reloadIgnoringCache();
    else tab.view.webContents.reload();
  }

  home() {
    this.navigateActive(this.getSettings().homepage || 'longview://newtab/');
  }

  find(text, options = {}) {
    const tab = this.activeTab();
    if (!tab) return;
    tab.view.webContents.send('longview:command', {
      type: 'materialize',
      reason: 'find-in-page',
      holdMs: 30000
    });
    if (!text) {
      tab.view.webContents.stopFindInPage('clearSelection');
      return;
    }
    tab.view.webContents.findInPage(text, {
      forward: options.forward !== false,
      findNext: Boolean(options.findNext),
      matchCase: Boolean(options.matchCase)
    });
  }

  stopFind(action = 'keepSelection') {
    const tab = this.activeTab();
    if (!tab) return;
    tab.view.webContents.stopFindInPage(action);
    tab.view.webContents.send('longview:command', {
      type: 'release-materialization',
      reason: 'find-in-page'
    });
  }

  setLongViewConfig(config) {
    for (const tab of this.tabs.values()) {
      tab.view.webContents.send('longview:command', { type: 'set-config', config });
    }
  }

  rescanActive() {
    this.activeTab()?.view.webContents.send('longview:command', { type: 'rescan' });
  }

  openDevTools() {
    const tab = this.activeTab();
    if (!tab) return;
    if (tab.view.webContents.isDevToolsOpened()) tab.view.webContents.closeDevTools();
    else tab.view.webContents.openDevTools({ mode: 'detach' });
  }

  adjustZoom(delta) {
    const tab = this.activeTab();
    if (!tab) return;
    const current = tab.view.webContents.getZoomFactor();
    tab.view.webContents.setZoomFactor(Math.min(3, Math.max(0.25, current + delta)));
  }

  resetZoom() {
    this.activeTab()?.view.webContents.setZoomFactor(1);
  }

  handleMetrics(webContentsId, metrics) {
    const tab = [...this.tabs.values()].find((candidate) => candidate.view.webContents.id === webContentsId);
    if (!tab) return;
    tab.metrics = metrics;
    if (tab.id === this.activeTabId) this.onMetrics(metrics);
    this.emitState();
  }

  getTabByWebContentsId(webContentsId) {
    return [...this.tabs.values()].find((tab) => tab.view.webContents.id === webContentsId) || null;
  }

  serializeSession() {
    const tabs = [...this.tabs.values()]
      .map((tab) => tab.url)
      .filter((url) => url && !/^devtools:/i.test(url));
    const activeIndex = Math.max(0, [...this.tabs.keys()].indexOf(this.activeTabId));
    return { tabs: tabs.length ? tabs : ['longview://newtab/'], activeIndex };
  }

  state(bookmarks = []) {
    const active = this.activeTab();
    const activeState = active
      ? {
          id: active.id,
          title: active.title,
          url: active.url,
          displayUrl: displayUrl(active.url),
          loading: active.loading,
          crashed: active.crashed,
          loadError: active.loadError || null,
          canGoBack: this.canGoBack(active.id),
          canGoForward: this.canGoForward(active.id),
          isInternal: isInternalUrl(active.url),
          isBookmarked: bookmarks.some((bookmark) => bookmark.url === active.url),
          metrics: active.metrics,
          targetUrl: active.targetUrl
        }
      : null;

    return {
      tabs: [...this.tabs.values()].map((tab) => ({
        id: tab.id,
        title: tab.title || tab.url,
        url: tab.url,
        loading: tab.loading,
        favicon: tab.favicon,
        crashed: tab.crashed
      })),
      activeTabId: this.activeTabId,
      active: activeState
    };
  }

  emitState() {
    this.onStateChanged({ type: 'tabs' });
  }

  destroy() {
    for (const tab of this.tabs.values()) tab.view.webContents.close();
    this.tabs.clear();
    this.activeTabId = null;
  }
}

module.exports = { TabManager };
