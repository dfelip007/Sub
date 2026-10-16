'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopBridge', {
  read: (area, key) => ipcRenderer.invoke('profiles:read', area, key),
  write: (area, values) => ipcRenderer.invoke('profiles:write', area, values),
  remove: (area, key) => ipcRenderer.invoke('profiles:remove', area, key),
  checkout: () => ipcRenderer.invoke('checkout:state'),
  open: (newWindow = false) => ipcRenderer.invoke('checkout:open', newWindow),
  createBrowser: (label, count) => ipcRenderer.invoke('browsers:create', label, count),
  selectBrowser: id => ipcRenderer.invoke('browsers:select', id),
  renameBrowser: (id, label) => ipcRenderer.invoke('browsers:rename', id, label),
  removeBrowser: id => ipcRenderer.invoke('browsers:remove', id),
  selectTab: id => ipcRenderer.invoke('checkout:select', id),
  usage: cpfs => ipcRenderer.invoke('usage:status', cpfs),
  markUsed: cpf => ipcRenderer.invoke('usage:used', cpf),
  release: (cpf, expected) => ipcRenderer.invoke('usage:release', cpf, expected),
  prepare: tabId => ipcRenderer.invoke('checkout:prepare', tabId),
  fill: (tabId, data) => ipcRenderer.invoke('checkout:fill', tabId, data),
  onState: callback => { ipcRenderer.on('checkout:changed', (_event, state) => callback(state)); },
  onUsage: callback => { ipcRenderer.on('usage:changed', () => callback()); },
  onExpired: callback => { ipcRenderer.on('profiles:expired', () => callback()); }
});
