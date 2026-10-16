(() => {
  'use strict';
  const KEY = 'checkoutVault';
  const SESSION = 'checkoutVaultSession';
  const ITERATIONS = 310000;
  const SESSION_MS = 15 * 60 * 1000;
  const buyerFields = ['buyerName', 'cpf', 'birthDate'];
  const cardFields = ['cardNumber', 'cardHolder', 'cardExpiry', 'country', 'postalCode', 'city', 'state', 'street', 'streetNumber'];
  const encode = bytes => {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(binary);
  };
  const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const pick = (data, keys) => Object.fromEntries(keys.map(key => [key, String(data[key] || '').trim()]));
  class Vault {
    constructor(storage) {
      this.storage = storage;
      this.key = null;
      this.data = null;
      this.envelope = null;
      this.expiresAt = 0;
      this.queue = Promise.resolve();
    }
    get unlocked() { return Boolean(this.key && this.data && Date.now() < this.expiresAt); }
    async load() {
      this.envelope = (await this.storage.local.get(KEY))[KEY] || null;
      this.validateEnvelope();
      return Boolean(this.envelope);
    }
    validateEnvelope() {
      if (this.envelope && (this.envelope.version !== 1 || this.envelope.iterations !== ITERATIONS || !this.envelope.salt || !this.envelope.iv || !this.envelope.ciphertext)) throw new Error('Cofre inválido ou de outra versão. Os dados foram preservados.');
    }
    async derive(password, salt) {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: decode(salt), iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    }
    async encrypt(data, key, salt) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
      return { version: 1, iterations: ITERATIONS, salt, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
    }
    async decrypt(key) {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(this.envelope.iv) }, key, decode(this.envelope.ciphertext));
      const data = JSON.parse(new TextDecoder().decode(plain));
      if (!Array.isArray(data.buyers) || !Array.isArray(data.cards)) throw new Error('Estrutura de cofre inválida.');
      return data;
    }
    async remember() {
      // Chrome storage.session is memory-only and restricted to trusted extension contexts.
      if (!this.storage.session) return;
      try {
        await this.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
        await this.storage.session.set({ [SESSION]: { salt: this.envelope.salt, key: encode(new Uint8Array(await crypto.subtle.exportKey('raw', this.key))), expiresAt: this.expiresAt } });
      } catch {
        await this.storage.session.remove(SESSION).catch(() => {});
        // Saving the encrypted vault still works when session storage is unavailable.
      }
    }
    async create(password) {
      if (password.length < 10) throw new Error('Use uma senha com pelo menos 10 caracteres.');
      if (await this.load()) throw new Error('Já existe um cofre. Use a senha para desbloquear.');
      const salt = encode(crypto.getRandomValues(new Uint8Array(16)));
      const key = await this.derive(password, salt);
      const data = { buyers: [], cards: [] };
      const envelope = await this.encrypt(data, key, salt);
      await this.storage.local.set({ [KEY]: envelope });
      this.envelope = envelope;
      this.key = key;
      this.data = data;
      this.expiresAt = Date.now() + SESSION_MS;
      await this.remember();
    }
    async unlock(password) {
      if (!await this.load()) throw new Error('Crie seu cofre primeiro.');
      const key = await this.derive(password, this.envelope.salt);
      let data;
      try { data = await this.decrypt(key); }
      catch { throw new Error('Senha incorreta ou cofre danificado. Os dados foram preservados.'); }
      this.key = key;
      this.data = data;
      this.expiresAt = Date.now() + SESSION_MS;
      await this.remember();
    }
    async restore() {
      if (!await this.load() || !this.storage.session) return false;
      const session = (await this.storage.session.get(SESSION))[SESSION];
      if (!session || session.salt !== this.envelope.salt || session.expiresAt <= Date.now()) { await this.lock(); return false; }
      try {
        const key = await crypto.subtle.importKey('raw', decode(session.key), 'AES-GCM', true, ['encrypt', 'decrypt']);
        const data = await this.decrypt(key);
        this.key = key;
        this.data = data;
        this.expiresAt = session.expiresAt;
        return true;
      } catch { await this.lock(); return false; }
    }
    async lock() {
      this.key = null;
      this.data = null;
      this.expiresAt = 0;
      await this.storage.session?.remove(SESSION);
    }
    list(kind) {
      if (!this.unlocked) throw new Error('Desbloqueie o cofre para usar os perfis.');
      if (!['buyers', 'cards'].includes(kind)) throw new Error('Tipo de perfil inválido.');
      return structuredClone(this.data[kind]);
    }
    change(kind, update) {
      const operation = this.queue.then(async () => {
        this.list(kind);
        const next = structuredClone(this.data);
        const key = this.key;
        const result = update(next[kind], next);
        const envelope = await this.encrypt(next, key, this.envelope.salt);
        if (!this.unlocked || this.key !== key) throw new Error('O cofre foi bloqueado. Desbloqueie e tente novamente.');
        await this.storage.local.set({ [KEY]: envelope });
        if (this.unlocked && this.key === key) { this.data = next; this.envelope = envelope; }
        return result;
      });
      this.queue = operation.catch(() => {});
      return operation;
    }
    save(kind, id, label, values) {
      if (!String(label).trim()) return Promise.reject(new Error('Dê um nome ao perfil.'));
      const fields = kind === 'buyers' ? buyerFields : cardFields;
      const record = { id: id || crypto.randomUUID(), label: String(label).trim().slice(0, 80), values: pick(values, fields) };
      return this.change(kind, items => {
        const index = items.findIndex(item => item.id === record.id);
        if (id && index < 0) throw new Error('Perfil não encontrado. Selecione novamente.');
        if (index < 0) items.push(record); else items[index] = record;
        return record.id;
      });
    }
    remove(kind, id) {
      return this.change(kind, items => {
        const index = items.findIndex(item => item.id === id);
        if (index < 0) throw new Error('Selecione um perfil para excluir.');
        items.splice(index, 1);
      });
    }
    async reset() {
      await this.queue;
      await this.lock();
      await this.storage.local.remove(KEY);
      this.envelope = null;
    }
  }
  globalThis.CheckoutVault = { Vault, buyerFields, cardFields };
})();
