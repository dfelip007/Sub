'use strict';
const { app, BrowserWindow, ipcMain, protocol, Menu, session } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { Store } = require('./store.cjs');
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
let checkout;
let storage;
let quitting = false;
let siteError = '';
const ui = path.join(__dirname, 'ui');
const safeWeb = { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, navigateOnDragDrop: false };

function state() {
  return { tab: checkout && !checkout.isDestroyed() ? { id: checkout.webContents.id, url: checkout.webContents.getURL() || HOME } : null, loading: Boolean(checkout && !checkout.isDestroyed() && checkout.webContents.isLoading()), error: siteError };
}
function notify() { if (controller && !controller.isDestroyed()) controller.webContents.send('checkout:changed', state()); }
function expire() { if (controller && !controller.isDestroyed()) controller.webContents.send('profiles:expired'); }
function guard(event) {
  if (!controller || controller.isDestroyed() || event.sender.id !== controller.webContents.id || event.senderFrame?.url !== CONTROL_URL || event.senderFrame.parent) throw new Error('Operação permitida somente no painel local.');
}
function current(tabId) {
  if (!checkout || checkout.isDestroyed() || checkout.webContents.id !== tabId || !canFill(checkout.webContents.getURL(), smoke)) throw new Error('Abra o checkout da Meaple na janela do programa.');
  return checkout.webContents;
}
const locationGuard = `if (!(${canFill.toString()})(location.href, ${smoke})) throw new Error('Página não permitida para preenchimento.');`;
function secureRemote(window) {
  window.webContents.on('will-navigate', (event, url) => { if (!canNavigate(url, smoke)) event.preventDefault(); });
  window.webContents.on('will-redirect', (event, url) => { if (!canNavigate(url, smoke)) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(({ url }) => canNavigate(url, smoke)
    ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { ...safeWeb, partition: 'persist:meaple-checkout' } } }
    : { action: 'deny' });
  window.webContents.on('did-create-window', child => secureRemote(child));
  window.webContents.on('page-title-updated', event => {
    event.preventDefault();
    try { window.setTitle(`Meaple — ${new URL(window.webContents.getURL()).hostname || 'site'}`); } catch { window.setTitle('Meaple — site'); }
  });
}
function openCheckout() {
  if (checkout && !checkout.isDestroyed()) {
    checkout.show();
    checkout.focus();
    if (siteError) { const url = checkout.webContents.getURL(); checkout.loadURL(canNavigate(url, smoke) ? url : HOME).catch(() => {}); }
    return state();
  }
  checkout = new BrowserWindow({ title: 'Meaple — site', width: 1120, height: 840, minWidth: 780, minHeight: 600, show: false, backgroundColor: '#11131b', webPreferences: { ...safeWeb, partition: 'persist:meaple-checkout' } });
  secureRemote(checkout);
  checkout.once('ready-to-show', () => { if (!checkout.isDestroyed()) checkout.showInactive(); });
  for (const event of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page']) checkout.webContents.on(event, () => { if (event === 'did-start-loading') siteError = ''; notify(); });
  checkout.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
    if (!mainFrame || code === -3) return;
    siteError = `Não foi possível carregar o site (código ${code}). Verifique a conexão e use Abrir / ver site para tentar novamente.`;
    notify();
  });
  checkout.on('closed', () => { checkout = null; notify(); });
  checkout.loadURL(HOME).catch(() => {});
  notify();
  return state();
}
function handlers() {
  const handle = (channel, action) => ipcMain.handle(channel, async (event, ...args) => { guard(event); return action(...args); });
  handle('profiles:read', (area, key) => storage.get(area, key));
  handle('profiles:write', (area, values) => storage.update(area, values));
  handle('profiles:remove', (area, key) => storage.update(area, key, true));
  handle('checkout:state', () => state());
  handle('checkout:open', () => openCheckout());
  handle('checkout:prepare', async tabId => {
    const source = await Promise.all(['dates.js', 'fill.js'].map(name => fs.readFile(path.join(ui, name), 'utf8')));
    const contents = current(tabId);
    await contents.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `${locationGuard}\n${source.join('\n')}` }]);
    return true;
  });
  handle('checkout:fill', async (tabId, values) => {
    const data = validateValues(values);
    try {
      const contents = current(tabId);
      const code = `(async () => { ${locationGuard} if (!globalThis.CheckoutAssist) throw new Error('O site mudou. Tente preencher novamente.'); return globalThis.CheckoutAssist.fillCheckout(${JSON.stringify(data)}); })()`;
      const result = await contents.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]);
      if (!result || !Array.isArray(result.filled) || !Array.isArray(result.pending)) throw new Error('Resposta de preenchimento inválida.');
      checkout.show();
      checkout.focus();
      return result;
    } finally { for (const key of Object.keys(data)) data[key] = ''; }
  });
}
async function start() {
  const allowed = new Set(['popup.html', 'popup.css', 'popup.js', 'dates.js', 'vault.js', 'profiles.js', 'import.js', 'fill.js', 'adapter.js']);
  protocol.handle('app', async request => {
    const url = new URL(request.url);
    const name = url.pathname.slice(1);
    if (url.host !== 'manager' || !allowed.has(name)) return new Response('Não encontrado', { status: 404 });
    const contentType = name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
    return new Response(await fs.readFile(path.join(ui, name)), { headers: { 'Content-Type': contentType, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'", 'X-Content-Type-Options': 'nosniff' } });
  });
  storage = new Store(path.join(app.getPath('userData'), 'profiles'), expire);
  const remote = session.fromPartition('persist:meaple-checkout');
  remote.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  remote.setPermissionCheckHandler(() => false);
  handlers();
  controller = new BrowserWindow({ title: 'Meaple — Perfis e preenchimento', width: 620, height: 860, minWidth: 570, minHeight: 640, show: false, backgroundColor: '#101218', webPreferences: { ...safeWeb, preload: path.join(__dirname, 'preload.cjs') } });
  controller.webContents.on('will-navigate', event => event.preventDefault());
  controller.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  controller.once('ready-to-show', () => { controller.show(); controller.focus(); });
  controller.on('close', () => { if (!quitting) app.quit(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Aplicativo', submenu: [{ label: 'Abrir / ver site', click: openCheckout }, { label: 'Voltar no site', click: () => { if (checkout?.webContents.navigationHistory.canGoBack()) checkout.webContents.navigationHistory.goBack(); } }, { label: 'Recarregar site', click: () => checkout?.webContents.reload() }, { label: 'Bloquear cofre', click: expire }, { type: 'separator' }, { role: 'quit', label: 'Sair' }] },
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
