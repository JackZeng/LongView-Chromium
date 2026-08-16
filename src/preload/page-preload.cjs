'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { LongViewEngine } = require('../engine/longview-engine.cjs');

let engine = null;
let lastConfig = null;

async function bootLongView() {
  if (engine) return;
  try {
    lastConfig = await ipcRenderer.invoke('longview:get-config');
    engine = new LongViewEngine({
      config: lastConfig,
      onMetrics: (metrics) => ipcRenderer.send('longview:metrics', metrics)
    });
    engine.start();
    ipcRenderer.send('longview:ready', {
      url: location.href,
      enabled: lastConfig.longviewEnabled !== false,
      mode: lastConfig.longviewMode
    });
  } catch (error) {
    ipcRenderer.send('longview:error', {
      name: error?.name || 'Error',
      message: error?.message || String(error),
      stack: error?.stack || null
    });
  }
}

ipcRenderer.on('longview:command', (_event, command = {}) => {
  if (!engine) return;
  switch (command.type) {
    case 'set-config':
      lastConfig = { ...lastConfig, ...command.config };
      engine.setConfig(lastConfig);
      break;
    case 'materialize':
      engine.materializeAll(command.reason || 'browser-command', command.holdMs ?? 5000);
      break;
    case 'release-materialization':
      engine.releaseMaterialization(command.reason);
      break;
    case 'rescan':
      engine.forceRescan();
      break;
    default:
      break;
  }
});

contextBridge.exposeInMainWorld('longviewInternal', Object.freeze({
  getData: () => ipcRenderer.invoke('internal:get-data'),
  command: (command, payload = {}) => ipcRenderer.invoke('internal:command', { command, payload }),
  onDataChanged: (listener) => {
    const wrapped = (_event, data) => listener(data);
    ipcRenderer.on('internal:data-changed', wrapped);
    return () => ipcRenderer.removeListener('internal:data-changed', wrapped);
  }
}));

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootLongView, { once: true });
} else {
  bootLongView();
}

window.addEventListener('pagehide', () => engine?.destroy(), { once: true });
