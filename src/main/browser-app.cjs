'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  BaseWindow,
  WebContentsView,
  Menu,
  dialog,
  ipcMain,
  session
} = require('electron');
const { TabManager } = require('./tab-manager.cjs');
const {
  DEFAULT_BROWSER_DATA,
  JsonStore,
  addHistoryEntry,
  sanitizeSettings
} = require('./storage.cjs');

const CHROME_HEIGHT = 96;

class WindowController {
  constructor(browserApp, options = {}) {
    this.browserApp = browserApp;
    this.appRoot = browserApp.appRoot;
    this.window = new BaseWindow({
      width: options.width || 1360,
      height: options.height || 900,
      minWidth: 780,
      minHeight: 520,
      title: 'LongView Browser',
      backgroundColor: '#f4f6f8',
      autoHideMenuBar: true
    });

    this.chromeView = new WebContentsView({
      webPreferences: {
        preload: path.join(this.appRoot, 'src', 'preload', 'chrome-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    });
    this.chromeView.setBackgroundColor('#f4f6f8');
    this.window.contentView.addChildView(this.chromeView);

    this.tabManager = new TabManager({
      window: this.window,
      appRoot: this.appRoot,
      getSettings: () => this.browserApp.getSettings(),
      onHistory: (entry) => this.browserApp.recordHistory(entry),
      onStateChanged: (event) => this.handleTabEvent(event),
      onMetrics: () => this.broadcastState()
    });

    this.chromeView.webContents.loadURL(pathToFileURL(path.join(this.appRoot, 'src', 'ui', 'index.html')).toString());
    this.chromeView.webContents.on('did-finish-load', () => this.broadcastState());
    this.chromeView.webContents.on('render-process-gone', () => this.window.close());

    this.window.on('resize', () => this.layout());
    this.window.on('focus', () => this.browserApp.focusedController = this);
    this.window.on('close', () => this.browserApp.persistSession(this));
    this.window.on('closed', () => {
      this.tabManager.destroy();
      this.chromeView.webContents.close();
      this.browserApp.removeWindow(this);
    });

    this.layout();
    this.restoreTabs(options.restoreSession !== false);
    this.window.show();
  }

  restoreTabs(restoreSession) {
    const sessionData = restoreSession && this.browserApp.getSettings().restoreSession
      ? this.browserApp.store.get('session', DEFAULT_BROWSER_DATA.session)
      : DEFAULT_BROWSER_DATA.session;
    const urls = Array.isArray(sessionData?.tabs) && sessionData.tabs.length
      ? sessionData.tabs.slice(0, 30)
      : ['longview://newtab/'];
    const activeIndex = Math.max(0, Math.min(urls.length - 1, Number(sessionData.activeIndex) || 0));

    urls.forEach((url, index) => this.tabManager.createTab(url, { activate: index === activeIndex }));
    if (!this.tabManager.activeTab()) this.tabManager.activateTab([...this.tabManager.tabs.keys()][activeIndex]);
  }

  layout() {
    const bounds = this.window.getContentBounds();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    this.chromeView.setBounds({ x: 0, y: 0, width, height: CHROME_HEIGHT });
    this.tabManager.layout({
      x: 0,
      y: CHROME_HEIGHT,
      width,
      height: Math.max(1, height - CHROME_HEIGHT)
    });
  }

  handleTabEvent(event) {
    if (event?.type === 'find') {
      this.chromeView.webContents.send('browser:find-state', event.result);
      return;
    }
    this.broadcastState();
  }

  state() {
    const bookmarks = this.browserApp.store.get('bookmarks', []);
    return {
      ...this.tabManager.state(bookmarks),
      settings: this.browserApp.getSettings(),
      downloads: this.browserApp.downloads,
      appVersion: this.browserApp.versionInfo,
      windowId: this.window.id
    };
  }

  broadcastState() {
    if (!this.chromeView.webContents.isDestroyed()) {
      this.chromeView.webContents.send('browser:state', this.state());
    }
  }

  showFind() {
    this.chromeView.webContents.send('browser:show-find');
  }

  handleCommand(command, payload = {}) {
    switch (command) {
      case 'new-tab':
        this.tabManager.createTab(payload.url || 'longview://newtab/');
        break;
      case 'close-tab':
        this.tabManager.closeTab(Number(payload.id || this.tabManager.activeTabId));
        break;
      case 'activate-tab':
        this.tabManager.activateTab(Number(payload.id));
        break;
      case 'navigate':
        this.tabManager.navigateActive(payload.input || payload.url || '');
        break;
      case 'back':
        this.tabManager.goBack();
        break;
      case 'forward':
        this.tabManager.goForward();
        break;
      case 'reload':
        this.tabManager.reload(undefined, Boolean(payload.ignoreCache));
        break;
      case 'home':
        this.tabManager.home();
        break;
      case 'toggle-bookmark':
        this.browserApp.toggleBookmark(this.tabManager.activeTab());
        break;
      case 'set-longview-enabled':
        this.browserApp.updateSettings({ longviewEnabled: Boolean(payload.enabled) });
        break;
      case 'set-longview-mode':
        this.browserApp.updateSettings({ longviewMode: payload.mode });
        break;
      case 'update-settings':
        this.browserApp.updateSettings(payload.settings || {});
        break;
      case 'open-internal':
        this.tabManager.navigateActive(`longview://${payload.page || 'newtab'}/`);
        break;
      case 'find':
        this.tabManager.find(payload.text || '', payload.options || {});
        break;
      case 'stop-find':
        this.tabManager.stopFind(payload.action || 'keepSelection');
        break;
      case 'show-find':
        this.showFind();
        break;
      case 'devtools':
        this.tabManager.openDevTools();
        break;
      case 'rescan':
        this.tabManager.rescanActive();
        break;
      case 'zoom-in':
        this.tabManager.adjustZoom(0.1);
        break;
      case 'zoom-out':
        this.tabManager.adjustZoom(-0.1);
        break;
      case 'zoom-reset':
        this.tabManager.resetZoom();
        break;
      case 'new-window':
        this.browserApp.createWindow({ restoreSession: false });
        break;
      default:
        throw new Error(`Unknown browser command: ${command}`);
    }
    this.broadcastState();
    return this.state();
  }
}

class BrowserApp {
  constructor(options) {
    this.electronApp = options.app;
    this.appRoot = options.appRoot;
    this.windows = new Set();
    this.focusedController = null;
    this.chromeControllerByWebContentsId = new Map();
    this.configOverrides = new Map();
    this.latestMetrics = new Map();
    this.downloads = [];
    this.permissionGrants = new Set();
    this.store = new JsonStore(
      path.join(this.electronApp.getPath('userData'), 'browser-data.json'),
      DEFAULT_BROWSER_DATA
    );
    this.store.load();
    this.versionInfo = this.readVersionInfo();
    this.registerIpc();
    this.configureSession();
    this.installMenu();
  }

  readVersionInfo() {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.appRoot, 'chromium.version'), 'utf8'));
    } catch {
      return {};
    }
  }

  getSettings() {
    return sanitizeSettings(this.store.get('settings', DEFAULT_BROWSER_DATA.settings));
  }

  createWindow(options = {}) {
    const controller = new WindowController(this, options);
    this.windows.add(controller);
    this.focusedController = controller;
    this.chromeControllerByWebContentsId.set(controller.chromeView.webContents.id, controller);
    return controller;
  }

  removeWindow(controller) {
    this.windows.delete(controller);
    this.chromeControllerByWebContentsId.delete(controller.chromeView.webContents.id);
    if (this.focusedController === controller) this.focusedController = [...this.windows][0] || null;
  }

  findControllerForPage(webContentsId) {
    for (const controller of this.windows) {
      if (controller.tabManager.getTabByWebContentsId(webContentsId)) return controller;
    }
    return null;
  }

  setConfigOverride(webContentsId, config) {
    this.configOverrides.set(webContentsId, sanitizeSettings(config));
  }

  clearConfigOverride(webContentsId) {
    this.configOverrides.delete(webContentsId);
  }

  recordHistory(entry) {
    addHistoryEntry(this.store, entry);
    this.broadcastInternalData();
  }

  persistSession(controller = this.focusedController) {
    if (!controller) return;
    this.store.set('session', controller.tabManager.serializeSession());
  }

  toggleBookmark(tab) {
    if (!tab?.url || !/^https?:|^longview:/i.test(tab.url)) return;
    this.store.update((data) => {
      const bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
      const index = bookmarks.findIndex((bookmark) => bookmark.url === tab.url);
      if (index >= 0) bookmarks.splice(index, 1);
      else bookmarks.unshift({ url: tab.url, title: tab.title || tab.url, createdAt: Date.now() });
      data.bookmarks = bookmarks.slice(0, 2000);
      return data;
    });
    this.broadcastAllStates();
    this.broadcastInternalData();
  }

  updateSettings(partial) {
    const settings = sanitizeSettings({ ...this.getSettings(), ...partial });
    this.store.set('settings', settings);
    for (const controller of this.windows) controller.tabManager.setLongViewConfig(settings);
    this.broadcastAllStates();
    this.broadcastInternalData();
    return settings;
  }

  internalData() {
    return {
      settings: this.getSettings(),
      history: this.store.get('history', []).slice(0, 1000),
      bookmarks: this.store.get('bookmarks', []).slice(0, 1000),
      version: this.versionInfo
    };
  }

  validateInternalSender(event) {
    const url = event.senderFrame?.url || event.sender.getURL();
    return /^longview:\/\//i.test(url);
  }

  handleInternalCommand(controller, command, payload = {}) {
    switch (command) {
      case 'navigate':
      case 'open-url':
        controller?.tabManager.navigateActive(payload.url || payload.input || '');
        break;
      case 'new-tab':
        controller?.tabManager.createTab(payload.url || 'longview://newtab/');
        break;
      case 'remove-history':
        this.store.update((data) => {
          data.history = (data.history || []).filter((entry) => entry.url !== payload.url || entry.visitedAt !== payload.visitedAt);
          return data;
        });
        break;
      case 'clear-history':
        this.store.set('history', []);
        break;
      case 'remove-bookmark':
        this.store.update((data) => {
          data.bookmarks = (data.bookmarks || []).filter((entry) => entry.url !== payload.url);
          return data;
        });
        break;
      case 'save-settings':
        this.updateSettings(payload.settings || {});
        break;
      case 'run-benchmark': {
        const turns = Math.max(10, Math.min(5000, Number(payload.turns) || 1000));
        controller?.tabManager.navigateActive(`longview://benchmark/?turns=${turns}`);
        break;
      }
      default:
        throw new Error(`Unknown internal command: ${command}`);
    }
    this.broadcastAllStates();
    this.broadcastInternalData();
    return this.internalData();
  }

  registerIpc() {
    ipcMain.handle('browser:get-state', (event) => {
      const controller = this.chromeControllerByWebContentsId.get(event.sender.id);
      if (!controller) throw new Error('Unknown browser chrome sender');
      return controller.state();
    });

    ipcMain.handle('browser:command', (event, request = {}) => {
      const controller = this.chromeControllerByWebContentsId.get(event.sender.id);
      if (!controller) throw new Error('Unknown browser chrome sender');
      return controller.handleCommand(request.command, request.payload);
    });

    ipcMain.handle('longview:get-config', (event) => {
      return this.configOverrides.get(event.sender.id) || this.getSettings();
    });

    ipcMain.on('longview:metrics', (event, metrics) => {
      this.latestMetrics.set(event.sender.id, metrics);
      const controller = this.findControllerForPage(event.sender.id);
      controller?.tabManager.handleMetrics(event.sender.id, metrics);
    });

    ipcMain.on('longview:error', (event, error) => {
      console.error('[LongView preload]', event.sender.getURL(), error);
    });

    ipcMain.handle('internal:get-data', (event) => {
      if (!this.validateInternalSender(event)) throw new Error('Internal API is restricted to longview:// pages');
      return this.internalData();
    });

    ipcMain.handle('internal:command', (event, request = {}) => {
      if (!this.validateInternalSender(event)) throw new Error('Internal API is restricted to longview:// pages');
      const controller = this.findControllerForPage(event.sender.id);
      return this.handleInternalCommand(controller, request.command, request.payload);
    });
  }

  configureSession() {
    const browserSession = session.fromPartition('persist:longview');

    browserSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
      if (['fullscreen', 'clipboard-sanitized-write'].includes(permission)) return true;
      return this.permissionGrants.has(`${requestingOrigin}|${permission}`);
    });

    browserSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      if (['fullscreen', 'clipboard-sanitized-write'].includes(permission)) {
        callback(true);
        return;
      }
      if (!['media', 'notifications', 'geolocation'].includes(permission)) {
        callback(false);
        return;
      }
      const origin = details.requestingUrl ? new URL(details.requestingUrl).origin : webContents.getURL();
      const response = dialog.showMessageBoxSync({
        type: 'question',
        buttons: ['Allow once', 'Deny'],
        defaultId: 1,
        cancelId: 1,
        title: 'Site permission',
        message: `${origin} requests ${permission} permission.`,
        detail: 'LongView does not grant sensitive permissions silently.'
      });
      const allowed = response === 0;
      if (allowed) this.permissionGrants.add(`${origin}|${permission}`);
      callback(allowed);
    });

    browserSession.on('will-download', (_event, item) => {
      const download = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        filename: item.getFilename(),
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
        state: 'progressing'
      };
      this.downloads = [download, ...this.downloads].slice(0, 10);
      this.broadcastAllStates();

      item.on('updated', (_updateEvent, state) => {
        download.receivedBytes = item.getReceivedBytes();
        download.totalBytes = item.getTotalBytes();
        download.state = state;
        this.broadcastAllStates();
      });
      item.once('done', (_doneEvent, state) => {
        download.receivedBytes = item.getReceivedBytes();
        download.totalBytes = item.getTotalBytes();
        download.state = state;
        this.broadcastAllStates();
      });
    });
  }

  installMenu() {
    const focused = () => this.focusedController;
    const template = [
      {
        label: 'File',
        submenu: [
          { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => focused()?.handleCommand('new-tab') },
          { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => this.createWindow({ restoreSession: false }) },
          { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => focused()?.handleCommand('close-tab') },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
          { type: 'separator' },
          { label: 'Find in Page', accelerator: 'CmdOrCtrl+F', click: () => focused()?.showFind() }
        ]
      },
      {
        label: 'View',
        submenu: [
          { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => focused()?.handleCommand('reload') },
          { label: 'Reload Ignoring Cache', accelerator: 'CmdOrCtrl+Shift+R', click: () => focused()?.handleCommand('reload', { ignoreCache: true }) },
          { type: 'separator' },
          { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => focused()?.handleCommand('zoom-in') },
          { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => focused()?.handleCommand('zoom-out') },
          { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => focused()?.handleCommand('zoom-reset') },
          { type: 'separator' },
          { label: 'Developer Tools', accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I', click: () => focused()?.handleCommand('devtools') },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'LongView',
        submenu: [
          { label: 'Rescan Current Page', accelerator: 'CmdOrCtrl+Shift+L', click: () => focused()?.handleCommand('rescan') },
          { label: 'Open Benchmark', click: () => focused()?.tabManager.navigateActive('longview://benchmark/?turns=1000') },
          { label: 'Settings', click: () => focused()?.tabManager.navigateActive('longview://settings/') }
        ]
      }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  broadcastAllStates() {
    for (const controller of this.windows) controller.broadcastState();
  }

  broadcastInternalData() {
    const data = this.internalData();
    for (const controller of this.windows) {
      for (const tab of controller.tabManager.tabs.values()) {
        if (/^longview:\/\/(history|bookmarks|settings|newtab)/i.test(tab.url)) {
          tab.view.webContents.send('internal:data-changed', data);
        }
      }
    }
  }

  destroy() {
    for (const controller of [...this.windows]) {
      this.persistSession(controller);
      controller.window.close();
    }
    ipcMain.removeHandler('browser:get-state');
    ipcMain.removeHandler('browser:command');
    ipcMain.removeHandler('longview:get-config');
    ipcMain.removeHandler('internal:get-data');
    ipcMain.removeHandler('internal:command');
  }
}

module.exports = {
  BrowserApp,
  CHROME_HEIGHT,
  WindowController
};
