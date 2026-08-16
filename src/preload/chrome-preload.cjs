'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('longviewBrowser', Object.freeze({
  command: (command, payload = {}) => ipcRenderer.invoke('browser:command', { command, payload }),
  getState: () => ipcRenderer.invoke('browser:get-state'),
  onState: (listener) => {
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on('browser:state', wrapped);
    return () => ipcRenderer.removeListener('browser:state', wrapped);
  },
  onShowFind: (listener) => {
    const wrapped = () => listener();
    ipcRenderer.on('browser:show-find', wrapped);
    return () => ipcRenderer.removeListener('browser:show-find', wrapped);
  },
  onFindState: (listener) => {
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on('browser:find-state', wrapped);
    return () => ipcRenderer.removeListener('browser:find-state', wrapped);
  }
}));
