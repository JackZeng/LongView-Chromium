'use strict';

const path = require('node:path');
const { app, net, protocol, session } = require('electron');
const { BrowserApp } = require('./browser-app.cjs');
const { runBenchmarkCli } = require('./benchmark-runner.cjs');
const { registerLongViewHandler, registerLongViewPrivileges } = require('./internal-protocol.cjs');

const appRoot = path.resolve(__dirname, '..', '..');
const isBenchmark = process.argv.includes('--benchmark');

registerLongViewPrivileges(protocol);
app.setName('LongView Browser');

if (!isBenchmark && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let browserApp = null;

  app.on('second-instance', (_event, argv) => {
    const controller = browserApp?.focusedController || [...(browserApp?.windows || [])][0];
    if (!controller) return;
    const candidate = argv.find((argument) => /^https?:\/\//i.test(argument));
    controller.window.show();
    controller.window.focus();
    if (candidate) controller.tabManager.createTab(candidate);
  });

  app.whenReady().then(async () => {
    registerLongViewHandler({ protocol, net, appRoot });
    registerLongViewHandler({ protocol: session.fromPartition('persist:longview').protocol, net, appRoot });
    registerLongViewHandler({ protocol: session.fromPartition('persist:longview-benchmark').protocol, net, appRoot });
    browserApp = new BrowserApp({ app, appRoot });

    if (isBenchmark) {
      try {
        await runBenchmarkCli({ appRoot, browserApp });
        app.exit(0);
      } catch (error) {
        console.error(error);
        app.exit(1);
      }
      return;
    }

    browserApp.createWindow({ restoreSession: true });
  });

  app.on('activate', () => {
    if (browserApp && browserApp.windows.size === 0) browserApp.createWindow({ restoreSession: true });
  });

  app.on('before-quit', () => {
    for (const controller of browserApp?.windows || []) browserApp.persistSession(controller);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
