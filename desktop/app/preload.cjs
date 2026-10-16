'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopBridge', {
  read: (area, key) => ipcRenderer.invoke('profiles:read', area, key),
  write: (area, values) => ipcRenderer.invoke('profiles:write', area, values),
  remove: (area, key) => ipcRenderer.invoke('profiles:remove', area, key),
  checkout: () => ipcRenderer.invoke('checkout:state'),
  open: () => ipcRenderer.invoke('checkout:open'),
  prepare: tabId => ipcRenderer.invoke('checkout:prepare', tabId),
  fill: (tabId, data) => ipcRenderer.invoke('checkout:fill', tabId, data),
  onState: callback => { ipcRenderer.on('checkout:changed', (_event, state) => callback(state)); },
  onExpired: callback => { ipcRenderer.on('profiles:expired', () => callback()); }
});
