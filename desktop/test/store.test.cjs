const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { Store } = require('../app/store.cjs');
const contact = { email: 'contato@example.invalid', phone: '11900000000' };
function adapter(store) {
  const area = name => ({ get: key => store.get(name, key), set: values => store.update(name, values), remove: key => store.update(name, key, true), async setAccessLevel() {} });
  return { local: area('local'), session: area('session') };
}
test('cofre real persiste criptografado, reabre e mantém a chave somente em memória', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meaple-store-'));
  const store = new Store(directory);
  const other = new Store(directory);
  try {
    const context = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, structuredClone, btoa, atob, Date });
    vm.runInContext(await fs.readFile(path.resolve(__dirname, '../../src/vault.js'), 'utf8'), context);
    const vault = new context.CheckoutVault.Vault(adapter(store));
    await store.update('local', { contact });
    await vault.create('senha-ficticia-para-teste');
    const id = await vault.save('cards', '', 'Cartão de teste', { cardNumber: '0000000000001111', cardHolder: 'PESSOA TESTE', cardExpiry: '12/30', cardCvv: '000' });
    const disk = await fs.readFile(store.filename, 'utf8');
    for (const value of ['0000000000001111', 'PESSOA TESTE', 'cardCvv', 'senha-ficticia-para-teste', 'checkoutVaultSession']) assert.equal(disk.includes(value), false);
    const session = await store.get('session', 'checkoutVaultSession');
    assert.ok(session.checkoutVaultSession.key);
    assert.deepEqual(await other.get('session'), {});
    const reopened = new context.CheckoutVault.Vault(adapter(other));
    assert.equal(await reopened.restore(), false);
    await reopened.unlock('senha-ficticia-para-teste');
    assert.equal(reopened.list('cards')[0].id, id);
    assert.equal(reopened.list('cards')[0].values.cardNumber, '0000000000001111');
    assert.equal('cardCvv' in reopened.list('cards')[0].values, false);
    await reopened.lock();
    assert.deepEqual(await other.get('session'), {});
    assert.deepEqual((await other.get('local', 'contact')).contact, contact);
    if (process.platform !== 'win32') assert.equal((await fs.stat(store.filename)).mode & 0o077, 0);
  } finally { store.close(); other.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
test('arquivo danificado é preservado e nunca substituído por um cofre vazio', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meaple-corrupt-'));
  const store = new Store(directory);
  try {
    await fs.writeFile(store.filename, 'conteudo-invalido');
    await assert.rejects(store.get('local'), /preservado/);
    await assert.rejects(store.update('local', { contact }), /preservado/);
    assert.equal(await fs.readFile(store.filename, 'utf8'), 'conteudo-invalido');
  } finally { store.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
test('recusa gravação de PAN/CVV soltos e preserva gravações sequenciais', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meaple-fields-'));
  const store = new Store(directory);
  try {
    assert.throws(() => store.update('local', { cardCvv: '000' }), /Chave/);
    assert.throws(() => store.update('local', { contact: { ...contact, cardNumber: '0000000000001111' } }), /Contato/);
    assert.throws(() => store.update('other', { contact }), /Armazenamento/);
    assert.throws(() => store.update('local', null, true), /remoção/);
    await Promise.all([store.update('local', { contact }), store.update('local', { contact: { ...contact, phone: '11911111111' } })]);
    assert.equal((await store.get('local', 'contact')).contact.phone, '11911111111');
    assert.deepEqual((await fs.readdir(directory)), ['profiles.json']);
  } finally { store.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
test('sessão expira mesmo sem a interface aberta', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meaple-session-'));
  let expired = false;
  const store = new Store(directory, () => { expired = true; });
  try {
    await store.update('session', { checkoutVaultSession: { salt: 'YWJj', key: 'YWJj', expiresAt: Date.now() + 30 } });
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(expired, true);
    assert.deepEqual(await store.get('session'), {});
    assert.deepEqual(await fs.readdir(directory), []);
  } finally { store.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
