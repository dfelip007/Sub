const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
function setup(url = 'https://meaple.com.br/checkout') {
  const dom = new JSDOM(readFileSync(require.resolve('../src/popup.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://extension.invalid/' });
  const stored = {};
  const calls = [];
  dom.window.chrome = {
    storage: { local: {
      async get() { return { ...stored }; },
      async set(value) { Object.assign(stored, value); },
      async remove(key) { delete stored[key]; }
    } },
    tabs: { async query() { return [{ id: 1, url }]; } },
    scripting: { async executeScript(options) { calls.push(options); return [{ result: { filled: ['Nome'], pending: [] } }]; } }
  };
  dom.window.eval(readFileSync(require.resolve('../src/dates.js'), 'utf8'));
  dom.window.eval(readFileSync(require.resolve('../src/import.js'), 'utf8'));
  dom.window.eval(readFileSync(require.resolve('../src/popup.js'), 'utf8'));
  return { dom, stored, calls, doc: dom.window.document };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const purchase = {
  buyerName: 'Pessoa Teste', cpf: '00000000000', email: 'teste@example.invalid', phone: '11900000000', birthDate: '01/02/1990',
  cardNumber: '0000000000000000', cardHolder: 'PESSOA TESTE', cardExpiry: '12/30', cardCvv: '000',
  country: 'Brasil', postalCode: '00000000', city: 'Cidade Teste', state: 'SP', street: 'Rua Teste', streetNumber: '1', installments: '1'
};
test('importa texto sem sobrescrever os contatos fixos nem persistir os dados', async () => {
  const { dom, doc, stored } = setup();
  doc.querySelector('[name=email]').value = purchase.email;
  doc.querySelector('#import-data').value = 'Nome: Outra Pessoa\nCPF: 00000000000\nCartão: 0000000000000000\nCVV: 000\nE-mail: substituir@example.invalid\nEstado: RJ';
  doc.querySelector('#import').click();
  assert.equal(doc.querySelector('[name=buyerName]').value, 'Outra Pessoa');
  assert.equal(doc.querySelector('[name=email]').value, purchase.email);
  assert.equal(doc.querySelector('[name=cardCvv]').value, '000');
  assert.equal(doc.querySelector('#import-data').value, '');
  assert.deepEqual(stored, {});
  dom.window.close();
});
test('salva somente e-mail/telefone e apaga o contato quando solicitado', async () => {
  const { dom, doc, stored } = setup();
  for (const [key, value] of Object.entries(purchase)) doc.querySelector(`[name=${key}]`).value = value;
  doc.querySelector('#save-contact').click();
  await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(stored)), { contact: { email: purchase.email, phone: purchase.phone } });
  doc.querySelector('#forget-contact').click();
  await tick();
  assert.deepEqual(stored, {});
  dom.window.close();
});
test('envia dados ao preenchimento, limpa o cartão e não grava dados da compra', async () => {
  const { dom, doc, stored, calls } = setup();
  for (const [key, value] of Object.entries(purchase)) doc.querySelector(`[name=${key}]`).value = value;
  const form = doc.querySelector('#checkout');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(calls.length, 2);
  assert.deepEqual([...calls[0].files], ['src/dates.js', 'src/fill.js']);
  assert.equal(calls[1].target.tabId, 1);
  assert.equal(doc.querySelector('[name=cardNumber]').value, '');
  assert.equal(doc.querySelector('[name=cardCvv]').value, '');
  assert.equal(doc.querySelector('[name=email]').value, purchase.email);
  assert.equal(doc.querySelector('#fill').disabled, false);
  assert.deepEqual(stored, {});
  dom.window.close();
});
test('bloqueia o envio de dados a outro site', async () => {
  const { dom, doc, calls } = setup('https://outro-site.invalid/checkout');
  for (const [key, value] of Object.entries(purchase)) doc.querySelector(`[name=${key}]`).value = value;
  doc.querySelector('#checkout').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(calls.length, 0);
  assert.match(doc.querySelector('#status').textContent, /checkout da Meaple/);
  dom.window.close();
});
