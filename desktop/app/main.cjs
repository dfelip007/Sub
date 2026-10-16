'use strict';
const { app, BrowserWindow, ipcMain, protocol, Menu, session } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { Store } = require('./store.cjs');
const { Workspace, partition } = require('./workspace.cjs');
const { canFill, canNavigate, validateValues } = require('./policy.cjs');
const CONTROL_URL = 'app://manager/popup.html';
const WORLD = 1007;
const smoke = !app.isPackaged && process.argv.includes('--smoke-test');
const HOME = smoke ? 'http://127.0.0.1:8080/checkout.html' : 'https://meaple.com.br/';
app.setName('Meaple Preenchimento');
if (smoke) {
  const argument = process.argv.find(value => value.startsWith('--test-data='));
  if (!argument) throw new Error('Diretório de teste obrigatório.');
  const directory = path.resolve(argument.slice('--test-data='.length));
  fsSync.mkdirSync(directory, { recursive: true, mode: 0o700 });
  app.setPath('userData', directory);
  app.disableHardwareAcceleration();
}
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let controller;
const windows = new Map();
const inFlight = new Set();
let selectedTab = null;
let workspace;
let browsing;
let storage;
let quitting = false;

const ui = path.join(__dirname, 'ui');
const safeWeb = { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, navigateOnDragDrop: false };

function activeWindow() {
  const entry = windows.get(selectedTab);
  return entry?.profileId === browsing.selected ? entry : [...windows.values()].find(item => item.profileId === browsing.selected);
}
function state() {
  const selected = activeWindow();
  const tabs = [...windows.values()].map(entry => ({ id: entry.window.webContents.id, profileId: entry.profileId, url: entry.window.webContents.getURL() || HOME, loading: entry.window.webContents.isLoading(), error: entry.error }));
  const tab = tabs.find(item => item.id === selected?.window.webContents.id) || null;
  return { profiles: browsing.profiles, profileId: browsing.selected, tabs, tab, loading: tab?.loading || false, error: tab?.error || '' };
}
function notify() { if (controller && !controller.isDestroyed()) controller.webContents.send('checkout:changed', state()); }
function expire() { if (controller && !controller.isDestroyed()) controller.webContents.send('profiles:expired'); }
function usageChanged() { if (controller && !controller.isDestroyed()) controller.webContents.send('usage:changed'); }
function guard(event) {
  if (!controller || controller.isDestroyed() || event.sender.id !== controller.webContents.id || event.senderFrame?.url !== CONTROL_URL || event.senderFrame.parent) throw new Error('Operação permitida somente no painel local.');
}
function current(tabId) {
  const entry = windows.get(tabId);
  if (!entry || entry.window.isDestroyed() || !canFill(entry.window.webContents.getURL(), smoke)) throw new Error('Abra o checkout da Meaple na janela do programa.');
  return entry;
}
const locationGuard = `if (!(${canFill.toString()})(location.href, ${smoke})) throw new Error('Página não permitida para preenchimento.');`;
function configureSession(profileId) {
  const remote = session.fromPartition(partition(profileId));
  remote.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  remote.setPermissionCheckHandler(() => false);
}
function registerWindow(window, profileId) {
  const id = window.webContents.id;
  const entry = { window, profileId, error: '' };
  windows.set(id, entry);
  configureSession(profileId);
  window.webContents.on('will-navigate', (event, url) => { if (!canNavigate(url, smoke)) event.preventDefault(); });
  window.webContents.on('will-redirect', (event, url) => { if (!canNavigate(url, smoke)) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(({ url }) => canNavigate(url, smoke)
    ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { ...safeWeb, partition: partition(profileId) } } }
    : { action: 'deny' });
  window.webContents.on('did-create-window', child => { registerWindow(child, profileId); notify(); });
  const title = () => {
    const label = browsing.profiles.find(profile => profile.id === profileId)?.label || 'Perfil';
    try { window.setTitle(`${label} — ${new URL(window.webContents.getURL()).hostname || 'Meaple'}`); } catch { window.setTitle(`${label} — Meaple`); }
  };
  window.webContents.on('page-title-updated', event => { event.preventDefault(); title(); });
  for (const event of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page']) window.webContents.on(event, () => {
    if (event === 'did-start-loading') entry.error = '';
    title(); notify();
  });
  window.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
    if (!mainFrame || code === -3) return;
    entry.error = `Não foi possível carregar o site (código ${code}). Verifique a conexão e use Abrir / ver site para tentar novamente.`;
    notify();
  });
  window.on('closed', () => { windows.delete(id); if (selectedTab === id) selectedTab = null; notify(); });
  return entry;
}
function openCheckout(profileId = browsing.selected, newWindow = false) {
  if (!browsing.profiles.some(profile => profile.id === profileId)) throw new Error('Perfil de navegação não encontrado.');
  const selected = windows.get(selectedTab);
  const existing = !newWindow && (selected?.profileId === profileId ? selected : [...windows.values()].find(entry => entry.profileId === profileId));
  if (existing) {
    selectedTab = existing.window.webContents.id;
    existing.window.show(); existing.window.focus();
    if (existing.error) {
      const url = existing.window.webContents.getURL();
      existing.window.loadURL(canNavigate(url, smoke) ? url : HOME).catch(() => {});
    }
  } else {
    const window = new BrowserWindow({ title: 'Meaple — site', width: 1120, height: 840, minWidth: 780, minHeight: 600, show: false, backgroundColor: '#11131b', webPreferences: { ...safeWeb, partition: partition(profileId) } });
    registerWindow(window, profileId);
    if (profileId === browsing.selected) selectedTab = window.webContents.id;
    window.once('ready-to-show', () => { if (!window.isDestroyed()) window.showInactive(); });
    window.loadURL(HOME).catch(() => {});
  }
  notify();
  return state();
}
function handlers() {
  const handle = (channel, action) => ipcMain.handle(channel, async (event, ...args) => { guard(event); return action(...args); });
  handle('profiles:read', (area, key) => storage.get(area, key));
  handle('profiles:write', (area, values) => storage.update(area, values));
  handle('profiles:remove', (area, key) => storage.update(area, key, true));
  handle('checkout:state', () => state());
  handle('checkout:open', (newWindow = false) => openCheckout(browsing.selected, newWindow === true));
  handle('browsers:create', async (label, count) => { browsing = await workspace.create(label, count); selectedTab = null; notify(); return state(); });
  handle('browsers:select', async id => { browsing = await workspace.select(id); selectedTab = null; notify(); return state(); });
  handle('browsers:rename', async (id, label) => { browsing = await workspace.rename(id, label); notify(); return state(); });
  handle('browsers:remove', async id => {
    if ([...windows.values()].some(entry => entry.profileId === id && inFlight.has(entry.window.webContents.id))) throw new Error('Aguarde o preenchimento terminar antes de excluir o perfil.');
    browsing = await workspace.remove(id);
    for (const entry of [...windows.values()]) if (entry.profileId === id) entry.window.destroy();
    await session.fromPartition(partition(id)).clearStorageData();
    notify(); return state();
  });
  handle('checkout:select', id => {
    const entry = windows.get(id);
    if (!entry || entry.profileId !== browsing.selected) throw new Error('Janela de destino inválida.');
    selectedTab = id; notify(); return state();
  });
  handle('usage:status', cpfs => workspace.statuses(cpfs));
  handle('usage:used', async cpf => { await workspace.markUsed(cpf, browsing.selected); usageChanged(); });
  handle('usage:release', async (cpf, expected) => {
    if (inFlight.size) throw new Error('Aguarde o preenchimento terminar antes de liberar um CPF.');
    await workspace.release(cpf, expected); usageChanged();
  });
  handle('checkout:prepare', async tabId => {
    const source = await Promise.all(['dates.js', 'fill.js'].map(name => fs.readFile(path.join(ui, name), 'utf8')));
    const contents = current(tabId).window.webContents;
    await contents.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `${locationGuard}\n${source.join('\n')}` }]);
    return true;
  });
  handle('checkout:fill', async (tabId, values) => {
    const data = validateValues(values);
    if (inFlight.has(tabId)) throw new Error('Esta janela já está sendo preenchida.');
    inFlight.add(tabId);
    try {
      const entry = current(tabId);
      // Persist the last-use timestamp before filling, including partially completed fills.
      await workspace.markUsed(data.cpf, entry.profileId);
      usageChanged();
      const contents = current(tabId).window.webContents;
      const code = `(async () => { ${locationGuard} if (!globalThis.CheckoutAssist) throw new Error('O site mudou. Tente preencher novamente.'); return globalThis.CheckoutAssist.fillCheckout(${JSON.stringify(data)}); })()`;
      const result = await contents.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]);
      if (!result || !Array.isArray(result.filled) || !Array.isArray(result.pending)) throw new Error('Resposta de preenchimento inválida.');
      entry.window.show(); entry.window.focus();
      return result;
    } finally {
      inFlight.delete(tabId);
      for (const key of Object.keys(data)) data[key] = '';
      usageChanged();
    }
  });
}
async function start() {
  const allowed = new Set(['popup.html', 'popup.css', 'dates.js', 'vault.js', 'wallet.js', 'import.js', 'fill.js', 'adapter.js']);
  protocol.handle('app', async request => {
    const url = new URL(request.url);
    const name = url.pathname.slice(1);
    if (url.host !== 'manager' || !allowed.has(name)) return new Response('Não encontrado', { status: 404 });
    const contentType = name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
    return new Response(await fs.readFile(path.join(ui, name)), { headers: { 'Content-Type': contentType, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'", 'X-Content-Type-Options': 'nosniff' } });
  });
  storage = new Store(path.join(app.getPath('userData'), 'profiles'), expire);
  workspace = new Workspace(path.join(app.getPath('userData'), 'profiles'));
  browsing = await workspace.init();
  handlers();
  controller = new BrowserWindow({ title: 'Meaple — Assistente de compras', width: 1100, height: 900, minWidth: 760, minHeight: 640, show: false, backgroundColor: '#f4f6f9', webPreferences: { ...safeWeb, preload: path.join(__dirname, 'preload.cjs') } });
  controller.webContents.on('will-navigate', event => event.preventDefault());
  controller.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  controller.once('ready-to-show', () => { controller.show(); controller.focus(); });
  controller.on('close', () => { if (!quitting) app.quit(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Aplicativo', submenu: [{ label: 'Abrir / ver site', click: () => openCheckout() }, { label: 'Voltar no site', click: () => { const contents = activeWindow()?.window.webContents; if (contents?.navigationHistory.canGoBack()) contents.navigationHistory.goBack(); } }, { label: 'Recarregar site', click: () => activeWindow()?.window.webContents.reload() }, { label: 'Bloquear cofre', click: expire }, { type: 'separator' }, { role: 'quit', label: 'Sair' }] },
    { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }
  ]));
  await controller.loadURL(CONTROL_URL);
  openCheckout();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (controller && !controller.isDestroyed()) { controller.show(); controller.focus(); } });
  app.whenReady().then(start).catch(() => { console.error('Não foi possível iniciar o aplicativo. Nenhum dado de pagamento foi registrado no log.'); app.exit(1); });
}
app.on('before-quit', () => { quitting = true; storage?.close(); });
app.on('window-all-closed', () => app.quit());
