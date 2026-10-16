'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const LOCAL_KEYS = new Set(['contact', 'checkoutVault']);
const SESSION_KEY = 'checkoutVaultSession';
class Store {
  constructor(directory, onExpired = () => {}) {
    this.directory = directory;
    this.filename = path.join(directory, 'profiles.json');
    this.session = {};
    this.queue = Promise.resolve();
    this.onExpired = onExpired;
    this.timer = null;
  }
  async readDisk() {
    try {
      const data = JSON.parse(await fs.readFile(this.filename, 'utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !LOCAL_KEYS.has(key))) throw new Error('schema');
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new Error('Não foi possível ler os perfis locais. O arquivo original foi preservado.');
    }
  }
  validateArea(area, key) {
    if (!['local', 'session'].includes(area)) throw new Error('Armazenamento inválido.');
    if (key != null && (area === 'local' ? !LOCAL_KEYS.has(key) : key !== SESSION_KEY)) throw new Error('Chave de armazenamento inválida.');
  }
  validateValue(key, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Registro inválido.');
    if (key === 'contact') {
      if (Object.keys(value).some(field => !['email', 'phone'].includes(field)) || typeof value.email !== 'string' || typeof value.phone !== 'string' || value.email.length > 500 || value.phone.length > 80) throw new Error('Contato inválido.');
    } else if (key === 'checkoutVault') {
      if (Object.keys(value).some(field => !['version', 'iterations', 'salt', 'iv', 'ciphertext'].includes(field)) || value.version !== 1 || value.iterations !== 310000 || ![value.salt, value.iv, value.ciphertext].every(item => typeof item === 'string' && item.length && /^[A-Za-z0-9+/=]+$/.test(item)) || value.ciphertext.length > 5 * 1024 * 1024) throw new Error('Cofre criptografado inválido.');
    } else {
      if (Object.keys(value).some(field => !['salt', 'key', 'expiresAt'].includes(field)) || ![value.salt, value.key].every(item => typeof item === 'string' && item.length <= 100 && /^[A-Za-z0-9+/=]+$/.test(item)) || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now() || value.expiresAt > Date.now() + 15 * 60 * 1000 + 5000) throw new Error('Sessão inválida.');
    }
  }
  expire() {
    const session = this.session[SESSION_KEY];
    // A timeout may fire just before the wall-clock deadline. Re-arm it rather
    // than leaving the session alive until the next storage read.
    if (session && session.expiresAt > Date.now()) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.expire(), session.expiresAt - Date.now());
      this.timer.unref?.();
      return;
    }
    if (session && session.expiresAt <= Date.now()) {
      this.session = {};
      clearTimeout(this.timer);
      this.onExpired();
    }
  }
  async get(area, key = null) {
    this.validateArea(area, key);
    await this.queue;
    this.expire();
    const data = area === 'local' ? await this.readDisk() : this.session;
    return structuredClone(key == null ? data : { [key]: data[key] });
  }
  update(area, values, remove = false) {
    if (remove && typeof values !== 'string') throw new Error('Chave de remoção inválida.');
    this.validateArea(area, remove ? values : null);
    if (!remove) {
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Registro inválido.');
      for (const [key, value] of Object.entries(values)) { this.validateArea(area, key); this.validateValue(key, value); }
    }
    const operation = this.queue.then(async () => {
      const data = area === 'local' ? await this.readDisk() : structuredClone(this.session);
      if (remove) delete data[values]; else Object.assign(data, structuredClone(values));
      if (area === 'session') {
        this.session = data;
        clearTimeout(this.timer);
        const session = data[SESSION_KEY];
        if (session) { this.timer = setTimeout(() => this.expire(), Math.max(0, session.expiresAt - Date.now())); this.timer.unref?.(); }
        return;
      }
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporary = path.join(this.directory, `profiles-${crypto.randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
        await fs.rename(temporary, this.filename);
      } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  close() { clearTimeout(this.timer); this.session = {}; }
}
module.exports = { Store };
