'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// Browser sessions and a CPF ledger are independent of the erasable buyer/card vault.
// CPFs are indexed using an installation-specific HMAC; no raw CPF/card goes here.
class Workspace {
  constructor(directory) {
    this.directory = directory;
    this.filename = path.join(directory, 'workspace.json');
    this.queue = Promise.resolve();
  }
  async read() {
    try {
      const data = JSON.parse(await fs.readFile(this.filename, 'utf8'));
      if (data.version !== 1 || !/^[a-f0-9]{64}$/.test(data.secret) || !Array.isArray(data.profiles) || !data.profiles.length || data.profiles.length > 100 || !data.profiles.some(profile => profile.id === data.selected) || !data.usage || typeof data.usage !== 'object' || Array.isArray(data.usage)) throw new Error('schema');
      const ids = new Set();
      for (const profile of data.profiles) {
        if (!/^(legacy|[a-f0-9-]{36})$/.test(profile.id) || ids.has(profile.id) || typeof profile.label !== 'string' || !profile.label.trim() || profile.label.length > 80) throw new Error('schema');
        if (profile.lastFilledAt !== undefined && (!Number.isSafeInteger(profile.lastFilledAt) || profile.lastFilledAt <= 0)) throw new Error('schema');
        ids.add(profile.id);
      }
      for (const [key, entry] of Object.entries(data.usage)) {
        if (!/^[a-f0-9]{64}$/.test(key) || !entry || entry.status !== 'used' || typeof entry.profileId !== 'string' || !Number.isFinite(entry.at)) throw new Error('schema');
      }
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, secret: crypto.randomBytes(32).toString('hex'), profiles: [{ id: 'legacy', label: 'Perfil 1' }], selected: 'legacy', usage: {} };
      throw new Error('Não foi possível ler os perfis de navegação e o controle de CPF. O arquivo foi preservado; o preenchimento está bloqueado.');
    }
  }
  transaction(action) {
    const operation = this.queue.then(async () => {
      const data = await this.read();
      const result = await action(data);
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporary = path.join(this.directory, `workspace-${crypto.randomUUID()}.tmp`);
      try {
        const file = await fs.open(temporary, 'wx', 0o600);
        try { await file.writeFile(JSON.stringify(data)); await file.sync(); } finally { await file.close(); }
        await fs.rename(temporary, this.filename);
      } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      return structuredClone(result);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  snapshot(data) { return { profiles: data.profiles, selected: data.selected }; }
  init() { return this.transaction(data => this.snapshot(data)); }
  profile(data, id) {
    const profile = data.profiles.find(item => item.id === id);
    if (!profile) throw new Error('Perfil de navegação não encontrado.');
    return profile;
  }
  create(label, count = 1) {
    if (typeof label !== 'string' || !label.trim() || label.trim().length > 70 || !Number.isInteger(count) || count < 1 || count > 50) return Promise.reject(new Error('Informe um nome e uma quantidade de 1 a 50 perfis.'));
    return this.transaction(data => {
      if (data.profiles.length + count > 100) throw new Error('O limite é de 100 perfis de navegação.');
      const added = Array.from({ length: count }, (_, index) => ({ id: crypto.randomUUID(), label: count === 1 ? label.trim() : `${label.trim()} ${index + 1}` }));
      data.profiles.push(...added);
      data.selected = added[0].id;
      return this.snapshot(data);
    });
  }
  select(id) { return this.transaction(data => { this.profile(data, id); data.selected = id; return this.snapshot(data); }); }
  markProfileFilled(id) {
    return this.transaction(data => {
      const profile = this.profile(data, id);
      profile.lastFilledAt = Math.max(Date.now(), (profile.lastFilledAt || 0) + 1);
      return this.snapshot(data);
    });
  }
  clearProfileUse(id, expected) {
    return this.transaction(data => {
      const profile = this.profile(data, id);
      if (!Number.isSafeInteger(expected) || profile.lastFilledAt !== expected) throw new Error('A utilização do perfil mudou. Confira novamente antes de limpar a marcação.');
      delete profile.lastFilledAt;
      return this.snapshot(data);
    });
  }
  rename(id, label) {
    if (typeof label !== 'string' || !label.trim() || label.trim().length > 80) return Promise.reject(new Error('Informe um nome de até 80 caracteres.'));
    return this.transaction(data => { this.profile(data, id).label = label.trim(); return this.snapshot(data); });
  }
  remove(id) {
    return this.transaction(data => {
      this.profile(data, id);
      if (data.profiles.length === 1) throw new Error('Mantenha pelo menos um perfil de navegação.');
      data.profiles = data.profiles.filter(profile => profile.id !== id);
      if (data.selected === id) data.selected = data.profiles[0].id;
      // Never erase the CPF ledger when removing a browser profile.
      return this.snapshot(data);
    });
  }
  key(data, cpf) {
    if (typeof cpf !== 'string' || !/^[\d.\-\s]+$/.test(cpf)) throw new Error('Informe um CPF com 11 dígitos.');
    const digits = cpf.replace(/\D/g, '');
    if (!/^\d{11}$/.test(digits)) throw new Error('Informe um CPF com 11 dígitos.');
    return crypto.createHmac('sha256', Buffer.from(data.secret, 'hex')).update(digits).digest('hex');
  }
  async statuses(cpfs) {
    if (!Array.isArray(cpfs) || cpfs.length > 1000) throw new Error('Consulta de CPFs inválida.');
    await this.queue;
    const data = await this.read();
    return cpfs.map(cpf => {
      const entry = data.usage[this.key(data, cpf)];
      if (!entry) return { status: 'available' };
      return { status: entry.status, at: entry.at, profile: data.profiles.find(profile => profile.id === entry.profileId)?.label || 'Perfil excluído' };
    });
  }
  markUsed(cpf, profileId) {
    return this.transaction(data => {
      this.profile(data, profileId);
      const key = this.key(data, cpf);
      data.usage[key] = { status: 'used', profileId, at: Math.max(Date.now(), (data.usage[key]?.at || 0) + 1) };
    });
  }
  release(cpf, expected) {
    return this.transaction(data => {
      const key = this.key(data, cpf);
      const entry = data.usage[key];
      if (!entry || entry.status !== expected?.status || entry.at !== expected?.at) throw new Error('O estado do CPF mudou. Confira novamente antes de liberar.');
      delete data.usage[key];
    });
  }
}
function partition(id) { return id === 'legacy' ? 'persist:meaple-checkout' : `persist:meaple-${id}`; }
module.exports = { Workspace, partition };
