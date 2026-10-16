'use strict';
const { News, ACCOUNTS, INTERVAL_MS, newsUrl } = require('./news.cjs');
const { readInstagram } = require('./news-reader.cjs');
const { canNavigate } = require('./policy.cjs');
const PARTITION = 'persist:submundo-instagram';
class Instagram {
  constructor({ directory, BrowserWindow, session, webPreferences, changed, smoke = false }) {
    this.store = new News(directory); this.BrowserWindow = BrowserWindow; this.session = session;
    this.webPreferences = webPreferences; this.changed = changed; this.smoke = smoke;
    this.windows = new Map(); this.viewers = new Map(); this.busy = false; this.closed = false; this.timer = null; this.lastCheck = 0; this.epoch = 0;
  }
  async state() {
    try { return { ...await this.store.state(), busy: this.busy, nextCheckAt: this.lastCheck + (this.smoke ? 0 : 30000), error: '' }; }
    catch (error) { return { enabled: false, intervalMs: INTERVAL_MS, profiles: ACCOUNTS.map(username => ({ username, items: [], unread: 0, status: 'unavailable', story: 'unknown' })), busy: this.busy, error: error.message }; }
  }
  async notify() { const state = await this.state(); if (!this.closed) this.changed(state); }
  async init() {
    const state = await this.state();
    if (state.enabled) { this.schedule(); void this.check().catch(() => {}); }
    await this.notify();
  }
  schedule() { clearInterval(this.timer); this.timer = setInterval(() => { void this.check().catch(() => {}); }, INTERVAL_MS); this.timer.unref(); }
  async configure(enabled) {
    await this.store.configure(enabled);
    clearInterval(this.timer);
    if (enabled) { this.schedule(); void this.check().catch(() => {}); }
    else { this.epoch++; for (const window of this.windows.values()) if (!window.isDestroyed()) window.destroy(); }
    await this.notify(); return this.state();
  }
  target(username, kind = 'profile', id = '') {
    const url = newsUrl(username, kind, id);
    return this.smoke ? url.replace('https://www.instagram.com', 'http://127.0.0.1:8080') : url;
  }
  create(username, viewer = false) {
    if (!ACCOUNTS.includes(username)) throw new Error('Perfil do Instagram não permitido.');
    const collection = viewer ? this.viewers : this.windows;
    const existing = collection.get(username);
    if (existing && !existing.isDestroyed()) return existing;
    const remote = this.session.fromPartition(PARTITION);
    remote.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    remote.setPermissionCheckHandler(() => false);
    const window = new this.BrowserWindow({ title: `Submundo — Instagram @${username}`, width: 1040, height: 820, minWidth: 760, minHeight: 600, show: false, autoHideMenuBar: true, webPreferences: { ...this.webPreferences, partition: PARTITION } });
    collection.set(username, window);
    const navigation = (event, url) => { if (!canNavigate(url, this.smoke)) event.preventDefault(); };
    window.webContents.on('will-navigate', navigation); window.webContents.on('will-redirect', navigation);
    // Keep authentication in the same isolated session/window, without giving
    // popup content a Node bridge or access to the local panel.
    window.webContents.setWindowOpenHandler(({ url }) => { if (canNavigate(url, this.smoke)) void window.loadURL(url).catch(() => {}); return { action: 'deny' }; });
    window.on('closed', () => { if (collection.get(username) === window) collection.delete(username); });
    return window;
  }
  async open(username, kind = 'profile', key = '') {
    let id = '';
    if (!['profile', 'stories'].includes(kind)) {
      const state = await this.store.state(); const item = state.profiles.find(profile => profile.username === username)?.items.find(item => item.key === key && item.kind === kind);
      if (!item) throw new Error('Conteúdo não encontrado nas novidades.');
      id = item.key.slice(item.key.indexOf(':') + 1);
    }
    const url = this.target(username, kind, id), window = this.create(username, true);
    if (window.webContents.getURL() !== url) void window.loadURL(url).catch(() => {});
    window.show(); window.focus();
    if (!['profile', 'stories'].includes(kind)) { await this.store.markItemRead(username, key); await this.notify(); }
    return this.state();
  }
  async inspect(username) {
    const window = this.create(username), contents = window.webContents;
    const target = this.target(username);
    // Readers are separate from visible login/story windows, with the same
    // Instagram session. Refreshing never interrupts what the user is viewing.
    {
      let timeout;
      try {
        await Promise.race([contents.loadURL(target), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), 20000); })]);
      } catch { if (!window.isDestroyed() && !window.isVisible()) contents.stop(); return { status: 'unavailable' }; }
      finally { clearTimeout(timeout); }
    }
    const deadline = Date.now() + (this.smoke ? 500 : 6000);
    while (!this.closed && !window.isDestroyed()) {
      try {
        const parsed = new URL(contents.getURL());
        if (!(parsed.protocol === 'https:' && ['www.instagram.com', 'instagram.com'].includes(parsed.hostname) || this.smoke && parsed.origin === 'http://127.0.0.1:8080')) return { status: 'outside' };
        const guard = `const u = new URL(location.href); if (!(u.protocol === 'https:' && ['www.instagram.com','instagram.com'].includes(u.hostname) || ${this.smoke} && u.origin === 'http://127.0.0.1:8080')) return {status:'outside'};`;
        let readTimeout;
        let result;
        try {
          result = await Promise.race([contents.executeJavaScriptInIsolatedWorld(1008, [{ code: `(() => { ${guard} return (${readInstagram.toString()})(document, ${JSON.stringify(username)}); })()` }]), new Promise((_, reject) => { readTimeout = setTimeout(() => reject(new Error('timeout')), 10000); })]);
        } catch { if (!window.isDestroyed()) window.destroy(); return { status: 'unavailable' }; }
        finally { clearTimeout(readTimeout); }
        if (result.status !== 'unavailable' || Date.now() >= deadline) return result;
      } catch { return { status: 'unavailable' }; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return { status: 'unavailable' };
  }
  async check() {
    if (this.closed || this.busy || !this.smoke && Date.now() - this.lastCheck < 30000) return this.state();
    const epoch = this.epoch;
    this.busy = true; this.lastCheck = Date.now(); await this.notify();
    try {
      await Promise.all(ACCOUNTS.map(async username => {
        let result; try { result = await this.inspect(username); } catch { result = { status: 'unavailable' }; }
        if (!this.closed && epoch === this.epoch) { await this.store.apply(username, result); await this.notify(); }
      }));
    } finally {
      this.busy = false;
      const state = await this.state();
      if (!state.enabled) for (const window of this.windows.values()) if (!window.isDestroyed()) window.destroy();
      await this.notify();
    }
    return this.state();
  }
  async markRead() { await this.store.markRead(); await this.notify(); return this.state(); }
  close() { this.closed = true; clearInterval(this.timer); }
}
module.exports = { Instagram, PARTITION };
