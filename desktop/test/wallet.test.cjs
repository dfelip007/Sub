'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { webcrypto } = require('node:crypto');
const { Store } = require('../app/store.cjs');
const password = 'senha-ficticia-para-teste';
const card = { cardNumber: '0000000000001111', cardHolder: 'PESSOA TESTE', cardExpiry: '12/30', country: 'Brasil', cardCvv: '987' };
async function fixture(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meaple-wallet-'));
  const store = new Store(directory);
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, structuredClone, btoa, atob, Date, Intl });
  for (const source of ['../../src/dates.js', '../../src/vault.js', '../app/wallet.js']) vm.runInContext(await fs.readFile(path.join(__dirname, source), 'utf8'), context);
  const area = name => ({ get: key => store.get(name, key), set: values => store.update(name, values), remove: key => store.update(name, key, true), async setAccessLevel() {} });
  const storage = { local: area('local'), session: area('session') };
  const { Wallet, cents } = context.CheckoutWallet;
  try { await run({ wallet: new Wallet(storage), Core: context.CheckoutVault.Vault, Wallet, cents, storage, store }); }
  finally { store.close(); await fs.rm(directory, { recursive: true, force: true }); }
}
test('valores brasileiros viram centavos exatos e formatos ambíguos inválidos são recusados', () => fixture(async ({ cents }) => {
  for (const [value, expected] of [['1.500,25',150025], ['R$ 0,10',10], ['1234.56',123456], ['1.000',100000], ['0',0], ['12,5',1250]]) assert.equal(cents(value), expected);
  for (const value of ['', '1,234', '12.34.56', '1e3', '-1,00', '999999999999999', 'NaN']) assert.throws(() => cents(value));
  assert.equal(cents('-1,25', true), -125);
}));
test('migra cofre 0.2, salva CVV só por opção e mantém CVV, limite e histórico criptografados', () => fixture(async ({ wallet, Core, Wallet, storage, store }) => {
  const old = new Core(storage); await old.create(password);
  const oldId = await old.save('cards', '', 'Legado', card);
  await old.lock(); await wallet.unlock(password);
  assert.equal(wallet.cards()[0].id, oldId);
  assert.equal(wallet.cards()[0].values.cardCvv, undefined);
  assert.equal(wallet.summary(oldId).available, null);
  await wallet.saveCard(oldId, 'Principal', card, { saveCvv: true, available: '1.000,00' });
  assert.equal(wallet.cards()[0].values.cardCvv, '987');
  assert.equal(wallet.summary(oldId).available, 100000);
  const disk = await fs.readFile(store.filename, 'utf8');
  for (const value of ['0000000000001111', 'cardCvv', 'budgetCents', 'PESSOA TESTE', password]) assert.equal(disk.includes(value), false);
  await wallet.lock(); const reopened = new Wallet(storage); await reopened.unlock(password);
  assert.equal(reopened.cards()[0].values.cardCvv, '987');
  await reopened.saveCard(oldId, 'Principal', card, { saveCvv: false, available: '1.000,00' });
  await reopened.lock(); await reopened.unlock(password);
  assert.equal(reopened.cards()[0].values.cardCvv, undefined);
  await assert.rejects(reopened.saveCard(oldId, 'Principal', { ...card, cardCvv: '' }, { saveCvv: true }), /CVV/);
}));
test('preencher e repetir não desconta; confirmar duas vezes desconta uma vez; ajuste preserva compras', () => fixture(async ({ wallet, Wallet, storage }) => {
  await wallet.create(password);
  const id = await wallet.saveCard('', 'Principal', card, { available: '1.000,00' });
  const args = { scope: 'sessao:janela', cardId: id, buyer: 'Daniel', buyerId: 'buyer-1', profile: 'Compras 1', amount: '123,45' };
  const orderId = await wallet.stageOrder(args);
  assert.equal(await wallet.stageOrder(args), orderId);
  assert.equal(wallet.orders().length, 1);
  assert.equal(wallet.summary(id).available, 100000);
  await Promise.all([wallet.confirmOrder(orderId, '123,45', 'PEDIDO-1'), wallet.confirmOrder(orderId, '123,45', 'PEDIDO-1')]);
  assert.equal(wallet.summary(id).available, 87655);
  await assert.rejects(wallet.confirmOrder(orderId, '123,46'), /já foi registrada/);
  // The form edits the CURRENT available amount, rather than silently subtracting past charges twice.
  await wallet.saveCard(id, 'Principal editado', card, { available: '800,00' });
  assert.equal(wallet.summary(id).available, 80000);
  assert.equal(wallet.orders()[0].amountCents, 12345);
  await wallet.lock(); const reopened = new Wallet(storage); await reopened.unlock(password);
  assert.equal(reopened.summary(id).available, 80000);
  assert.equal(reopened.orders()[0].status, 'confirmed');
  await reopened.finishOrder(orderId, 'reversed');
  await reopened.finishOrder(orderId, 'reversed');
  assert.equal(reopened.summary(id).available, 92345);
}));
test('cartões e compradores mantêm pendências separadas; cancelamento e pedido duplicado não debitam', () => fixture(async ({ wallet }) => {
  await wallet.create(password);
  const a = await wallet.saveCard('', 'A', card, { available: '100,00' });
  const b = await wallet.saveCard('', 'B', { ...card, cardNumber: '0000000000002222' }, { available: '200,00' });
  const args = { scope: 'mesma-janela', cardId: a, buyer: 'Daniel', buyerId: 'one', amount: '10,00' };
  const first = await wallet.stageOrder(args);
  const other = await wallet.stageOrder({ ...args, cardId: b });
  const buyer = await wallet.stageOrder({ ...args, buyerId: 'two' });
  assert.equal(new Set([first, other, buyer]).size, 3);
  await wallet.finishOrder(other, 'canceled');
  await wallet.confirmOrder(first, '10,00', 'REF');
  await assert.rejects(wallet.confirmOrder(buyer, '10,00', 'REF'), /já foi registrado/);
  assert.equal(wallet.summary(a).available, 9000);
  assert.equal(wallet.summary(b).available, 20000);
  await assert.rejects(wallet.remove('cards', a), /compras pendentes ou confirmadas/);
  await wallet.finishOrder(buyer, 'canceled');
  await assert.rejects(wallet.confirmOrder(buyer, '10,00'), /não está disponível/);
}));
test('falha de gravação não altera limite nem confirmação e a mesma operação pode ser repetida', () => fixture(async ({ wallet, storage }) => {
  await wallet.create(password);
  const id = await wallet.saveCard('', 'Teste', card, { available: '1,00' });
  const order = await wallet.stageOrder({ scope: 'x', cardId: id, buyer: 'Daniel', amount: '0,10' });
  const set = storage.local.set; storage.local.set = async () => { throw new Error('disco sem espaço'); };
  await assert.rejects(wallet.confirmOrder(order, '0,10'), /disco sem espaço/);
  assert.equal(wallet.summary(id).available, 100);
  assert.equal(wallet.orders()[0].status, 'pending');
  storage.local.set = set;
  await wallet.confirmOrder(order, '0,10');
  assert.equal(wallet.summary(id).available, 90);
}));
