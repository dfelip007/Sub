'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const ACCOUNTS = ['festivalsubmundo808', 'submundo808'];
const INTERVAL_MS = 5 * 60 * 1000;
function newsUrl(username, kind = 'profile', id = '') {
  if (!ACCOUNTS.includes(username)) throw new Error('Perfil do Instagram não permitido.');
  if (kind === 'profile') return `https://www.instagram.com/${username}/`;
  if (kind === 'stories') return `https://www.instagram.com/stories/${username}/`;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !['post', 'reel', 'story'].includes(kind) || kind === 'story' && !/^\d{1,30}$/.test(id)) throw new Error('Conteúdo do Instagram inválido.');
  return kind === 'story' ? `https://www.instagram.com/stories/${username}/${id}/` : `https://www.instagram.com/${kind === 'post' ? 'p' : 'reel'}/${id}/`;
}
function cleanItem(username, item) {
  const prefix = { post: 'p', reel: 'reel', story: 'story' }[item?.kind];
  const id = typeof item?.key === 'string' ? item.key.slice(item.key.indexOf(':') + 1) : '';
  if (!prefix || item.key !== `${prefix}:${id}` || item.url !== newsUrl(username, item.kind, id)) throw new Error('Conteúdo do Instagram inválido.');
  return { key: item.key, kind: item.kind, url: item.url };
}
class News {
  constructor(directory) { this.directory = directory; this.filename = path.join(directory, 'news.json'); this.queue = Promise.resolve(); }
  empty() { return { version: 1, enabled: false, profiles: Object.fromEntries(ACCOUNTS.map(username => [username, { initialized: false, known: [], items: [], lastSuccess: null, lastAttempt: null, status: 'idle', story: 'unknown' }])) }; }
  async read() {
    try {
      const data = JSON.parse(await fs.readFile(this.filename, 'utf8'));
      if (data.version !== 1 || typeof data.enabled !== 'boolean' || !data.profiles || Object.keys(data.profiles).length !== 2) throw new Error('schema');
      for (const username of ACCOUNTS) {
        const profile = data.profiles[username];
        if (!profile || typeof profile.initialized !== 'boolean' || !Array.isArray(profile.known) || profile.known.length > 1000 || !profile.known.every(key => /^(p|reel):[A-Za-z0-9_-]{1,80}$|^story:[0-9]{1,30}$/.test(key)) || !Array.isArray(profile.items) || profile.items.length > 60 || !['idle', 'ok', 'login', 'outside', 'unavailable'].includes(profile.status) || !['unknown', 'identified'].includes(profile.story)) throw new Error('schema');
        for (const item of profile.items) { cleanItem(username, item); if (!Number.isFinite(item.detectedAt) || typeof item.seen !== 'boolean') throw new Error('schema'); }
        for (const time of [profile.lastSuccess, profile.lastAttempt]) if (time != null && !Number.isFinite(time)) throw new Error('schema');
      }
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return this.empty();
      throw new Error('Não foi possível ler as novidades. O arquivo original foi preservado.');
    }
  }
  transaction(action) {
    const task = this.queue.then(async () => {
      const data = await this.read(); const result = action(data);
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporary = path.join(this.directory, `news-${crypto.randomUUID()}.tmp`);
      try { await fs.writeFile(temporary, JSON.stringify(data), { mode: 0o600, flag: 'wx' }); await fs.rename(temporary, this.filename); }
      finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      return result;
    }); this.queue = task.catch(() => {}); return task;
  }
  async state() { await this.queue; const data = await this.read(); return { enabled: data.enabled, intervalMs: INTERVAL_MS, profiles: ACCOUNTS.map(username => { const { known, ...profile } = data.profiles[username]; return { username, ...profile, unread: profile.items.filter(item => !item.seen).length }; }) }; }
  configure(enabled) { if (typeof enabled !== 'boolean') throw new Error('Configuração de novidades inválida.'); return this.transaction(data => { data.enabled = enabled; }); }
  apply(username, result, now = Date.now()) {
    if (!ACCOUNTS.includes(username) || !result || !['ok', 'login', 'outside', 'unavailable'].includes(result.status)) throw new Error('Leitura de novidades inválida.');
    const items = result.status === 'ok' ? result.items.map(item => cleanItem(username, item)) : [];
    if (items.length > 30 || new Set(items.map(item => item.key)).size !== items.length) throw new Error('Leitura de novidades inválida.');
    return this.transaction(data => {
      const profile = data.profiles[username]; profile.lastAttempt = now; profile.status = result.status;
      if (result.status !== 'ok') { profile.story = 'unknown'; return; }
      const baseline = !profile.initialized;
      for (const item of [...items].reverse()) {
        if (profile.known.includes(item.key)) continue;
        profile.known.push(item.key); profile.items.unshift({ ...item, detectedAt: now, seen: baseline });
      }
      profile.known = profile.known.slice(-1000); profile.items = profile.items.slice(0, 60);
      profile.initialized = true; profile.lastSuccess = now; profile.story = items.some(item => item.kind === 'story') ? 'identified' : 'unknown';
    });
  }
  markRead() { return this.transaction(data => { for (const profile of Object.values(data.profiles)) for (const item of profile.items) item.seen = true; }); }
  markItemRead(username, key) {
    if (!ACCOUNTS.includes(username)) throw new Error('Perfil do Instagram não permitido.');
    return this.transaction(data => { const item = data.profiles[username].items.find(item => item.key === key); if (item) item.seen = true; });
  }
}
module.exports = { News, ACCOUNTS, INTERVAL_MS, newsUrl };
