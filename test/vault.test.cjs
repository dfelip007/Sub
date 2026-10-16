const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = readFileSync(require.resolve('../src/vault.js'), 'utf8');
function setup() {
  const local = { contact: { email: 'fixo@example.invalid', phone: '11900000000' } };
  const session = {};
  let failNext = false;
  const area = data => ({
    async get(key) { return structuredClone(key ? { [key]: data[key] } : data); },
    async set(values) { if (failNext) { failNext = false; throw new Error('Simulated storage failure'); } Object.assign(data, structuredClone(values)); },
    async remove(key) { delete data[key]; },
    async setAccessLevel({ accessLevel }) { assert.equal(accessLevel, 'TRUSTED_CONTEXTS'); }
  });
  const storage = { local: area(local), session: area(session) };
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, structuredClone, btoa, atob, Date });
  vm.runInContext(source, context);
  const Vault = context.CheckoutVault.Vault;
  return { local, session, storage, Vault, vault: new Vault(storage), fail() { failNext = true; } };
}
const password = 'senha-ficticia-para-teste';
const buyer = { buyerName: 'Pessoa de Teste', cpf: '00000000000', birthDate: '01/02/1990', email: 'nao-salvar@example.invalid' };
const card = { cardNumber: '0000000000001111', cardHolder: 'PESSOA DE TESTE', cardExpiry: '12/30', country: 'Brasil', city: 'Cidade Teste', cardCvv: '987', password: 'nao-salvar' };

test('persiste compradores/cartões criptografados e exclui CVV, senha e contato da seleção', async () => {
  const { vault, local, session, Vault, storage } = setup();
  await vault.create(password);
  const buyerId = await vault.save('buyers', '', 'Daniel de teste', buyer);
  const cardId = await vault.save('cards', '', 'Principal', card);
  const serialized = JSON.stringify(local);
  for (const secret of [password, buyer.buyerName, buyer.cpf, card.cardNumber, card.cardHolder, 'Daniel de teste']) assert.equal(serialized.includes(secret), false);
  assert.deepEqual(Object.keys(local).sort(), ['checkoutVault', 'contact']);
  assert.equal(vault.list('buyers')[0].id, buyerId);
  assert.equal(vault.list('cards')[0].id, cardId);
  assert.equal('cardCvv' in vault.list('cards')[0].values, false);
  assert.equal('password' in vault.list('cards')[0].values, false);
  assert.equal('email' in vault.list('buyers')[0].values, false);
  assert.ok(session.checkoutVaultSession.key);
  const reopened = new Vault(storage);
  assert.equal(await reopened.restore(), true);
  assert.equal(reopened.list('cards')[0].values.cardNumber, card.cardNumber);
  await reopened.lock();
  assert.deepEqual(session, {});
});
test('senha incorreta e adulteração preservam o cofre sem expor dados', async () => {
  const { vault, local, storage, Vault } = setup();
  await vault.create(password);
  await vault.save('cards', '', 'Teste', card);
  await vault.lock();
  const before = JSON.stringify(local);
  const closed = new Vault(storage);
  await assert.rejects(closed.unlock('senha-incorreta'), /Senha incorreta/);
  assert.equal(JSON.stringify(local), before);
  assert.equal(closed.unlocked, false);
  await closed.unlock(password);
  assert.equal(closed.list('cards').length, 1);
  await closed.lock();
  const bytes = Buffer.from(local.checkoutVault.ciphertext, 'base64');
  bytes[0] ^= 1;
  local.checkoutVault.ciphertext = bytes.toString('base64');
  await assert.rejects(closed.unlock(password), /Senha incorreta ou cofre danificado/);
  assert.equal(closed.unlocked, false);
});
test('edita e exclui perfis independentes com novo IV a cada gravação', async () => {
  const { vault, local } = setup();
  await vault.create(password);
  const buyerId = await vault.save('buyers', '', 'Daniel', buyer);
  const a = await vault.save('cards', '', 'Cartão A', card);
  const oldIv = local.checkoutVault.iv;
  const b = await vault.save('cards', '', 'Cartão B', { ...card, cardNumber: '0000000000002222' });
  assert.notEqual(local.checkoutVault.iv, oldIv);
  await vault.save('buyers', buyerId, 'Outro nome', { ...buyer, buyerName: 'Outra Pessoa' });
  await vault.remove('cards', a);
  assert.equal(vault.list('buyers').length, 1);
  assert.equal(vault.list('buyers')[0].values.buyerName, 'Outra Pessoa');
  assert.equal(vault.list('cards').length, 1);
  assert.equal(vault.list('cards')[0].id, b);
  await assert.rejects(vault.save('cards', 'inexistente', 'X', card), /Perfil não encontrado/);
});
test('falha ao salvar não altera os perfis anteriores e uma nova tentativa funciona', async () => {
  const { vault, local, fail } = setup();
  await vault.create(password);
  const id = await vault.save('buyers', '', 'Daniel', buyer);
  const before = JSON.stringify(local);
  fail();
  await assert.rejects(vault.save('buyers', id, 'Alterado', { ...buyer, buyerName: 'Outra Pessoa' }), /storage failure/);
  assert.equal(JSON.stringify(local), before);
  assert.equal(vault.list('buyers')[0].label, 'Daniel');
  await vault.save('buyers', id, 'Alterado', buyer);
  assert.equal(vault.list('buyers')[0].label, 'Alterado');
});
test('sessão expira e apagar cofre preserva o contato fixo', async () => {
  const { vault, local, session, Vault, storage } = setup();
  await vault.create(password);
  await vault.save('cards', '', 'Cartão A', card);
  session.checkoutVaultSession.expiresAt = Date.now() - 1;
  const reopened = new Vault(storage);
  assert.equal(await reopened.restore(), false);
  assert.ok(local.checkoutVault);
  assert.deepEqual(session, {});
  await reopened.unlock(password);
  await reopened.reset();
  assert.deepEqual(Object.keys(local), ['contact']);
  assert.equal(local.contact.email, 'fixo@example.invalid');
});
