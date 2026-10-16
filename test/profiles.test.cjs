const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { webcrypto } = require('node:crypto');
const { JSDOM } = require('jsdom');
function setup(local = {}, session = {}) {
  const dom = new JSDOM(readFileSync(require.resolve('../src/popup.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://extension.invalid/' });
  const win = dom.window;
  Object.defineProperty(win, 'crypto', { value: webcrypto });
  Object.assign(win, { TextEncoder, TextDecoder, structuredClone });
  win.confirm = () => true;
  const area = data => ({
    async get(key) { return structuredClone(key ? { [key]: data[key] } : data); },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(key) { delete data[key]; },
    async setAccessLevel() {}
  });
  const calls = [];
  win.chrome = {
    storage: { local: area(local), session: area(session) },
    tabs: { async query() { return [{ id: 1, url: 'https://meaple.com.br/checkout' }]; } },
    scripting: { async executeScript(options) { calls.push({ ...options, args: structuredClone(options.args) }); return [{ result: { filled: ['Nome'], pending: [] } }]; } }
  };
  for (const file of ['dates', 'vault', 'import', 'popup', 'profiles']) win.eval(readFileSync(require.resolve(`../src/${file}.js`), 'utf8'));
  const doc = win.document;
  const set = values => { for (const [key, value] of Object.entries(values)) doc.querySelector(`[name=${key}]`).value = value; };
  const wait = async predicate => {
    const until = Date.now() + 5000;
    while (!predicate()) { if (Date.now() > until) throw new Error(`UI timeout: ${doc.querySelector('#vault-message').textContent}`); await new Promise(resolve => setTimeout(resolve, 5)); }
  };
  const click = id => doc.getElementById(id).click();
  const select = (id, value) => { const field = doc.getElementById(id); field.value = value; field.dispatchEvent(new win.Event('change', { bubbles: true })); };
  const create = async () => {
    await wait(() => doc.querySelector('#vault-state').textContent !== 'Carregando…');
    doc.querySelector('#vault-password').value = 'senha-ficticia-123';
    doc.querySelector('#vault-confirm').value = 'senha-ficticia-123';
    doc.querySelector('#vault-form').dispatchEvent(new win.Event('submit', { cancelable: true }));
    await wait(() => !doc.querySelector('#buyer-save').disabled);
  };
  const save = async prefix => { click(`${prefix}-save`); await wait(() => !doc.querySelector(`#${prefix}-save`).disabled); assert.equal(doc.querySelector('#vault-message').dataset.kind, 'success', doc.querySelector('#vault-message').textContent); return doc.querySelector(`#${prefix}-profile`).value; };
  return { dom, doc, win, local, session, set, wait, click, select, create, save, calls };
}
const buyer = { buyerName: 'Daniel de Teste', cpf: '00000000000', birthDate: '01021990' };
const card = { cardNumber: '0000000000001111', cardHolder: 'DANIEL TESTE', cardExpiry: '122030', country: 'Brasil', postalCode: '00000000', city: 'Cidade Teste', state: 'SP', street: 'Rua Teste', streetNumber: '1', cardCvv: '000' };

test('combina qualquer comprador com qualquer cartão e restaura perfis ao reabrir', async () => {
  const ui = setup();
  try {
    await ui.create();
    ui.set({ email: 'fixo@example.invalid', phone: '11900000000', ...buyer });
    ui.click('save-contact');
    ui.doc.querySelector('#buyer-label').value = 'Daniel';
    const daniel = await ui.save('buyer');
    ui.click('buyer-new');
    ui.set({ ...buyer, buyerName: 'Joana Teste' });
    ui.doc.querySelector('#buyer-label').value = 'Joana';
    await ui.save('buyer');
    ui.set(card);
    ui.doc.querySelector('#card-label').value = 'Principal';
    const principal = await ui.save('card');
    ui.click('card-new');
    assert.equal(ui.doc.querySelector('[name=cardCvv]').value, '');
    ui.set({ ...card, cardNumber: '0000000000002222', streetNumber: '2' });
    ui.doc.querySelector('#card-label').value = 'Reserva';
    await ui.save('card');
    ui.select('buyer-profile', daniel);
    ui.select('card-profile', principal);
    assert.equal(ui.doc.querySelector('[name=buyerName]').value, buyer.buyerName);
    assert.equal(ui.doc.querySelector('[name=birthDate]').value, '01/02/1990');
    assert.equal(ui.doc.querySelector('[name=cardNumber]').value, card.cardNumber);
    assert.equal(ui.doc.querySelector('[name=cardExpiry]').value, '12/30');
    assert.equal(ui.doc.querySelector('[name=streetNumber]').value, '1');
    assert.equal(ui.doc.querySelector('[name=cardCvv]').value, '');
    assert.equal(ui.doc.querySelector('[name=email]').value, 'fixo@example.invalid');
    assert.match(ui.doc.querySelector('#card-profile').selectedOptions[0].textContent, /final 1111/);
    ui.set({ cardCvv: '000', installments: '1' });
    ui.doc.querySelector('#checkout').dispatchEvent(new ui.win.Event('submit', { cancelable: true }));
    await ui.wait(() => ui.calls.length === 2);
    assert.equal(ui.calls[1].args[0].birthDate, '01/02/1990');
    assert.equal(ui.calls[1].args[0].cardExpiry, '12/30');
    ui.dom.window.close();
    const reopened = setup(ui.local, ui.session);
    try {
      await reopened.wait(() => !reopened.doc.querySelector('#buyer-save').disabled);
      assert.equal(reopened.doc.querySelector('#buyer-profile').options.length, 3);
      assert.equal(reopened.doc.querySelector('#card-profile').options.length, 3);
      reopened.select('buyer-profile', daniel);
      reopened.select('card-profile', principal);
      assert.equal(reopened.doc.querySelector('[name=cardNumber]').value, card.cardNumber);
      assert.equal(reopened.doc.querySelector('[name=cardCvv]').value, '');
      assert.equal(reopened.doc.querySelector('[name=email]').value, 'fixo@example.invalid');
      reopened.click('vault-lock');
      await reopened.wait(() => reopened.doc.querySelector('#buyer-save').disabled && reopened.doc.querySelector('[name=buyerName]').value === '');
      assert.equal(reopened.doc.querySelector('[name=cardNumber]').value, '');
      assert.equal(reopened.doc.querySelector('#buyer-profile').options.length, 1);
      assert.deepEqual(ui.session, {});
    } finally { reopened.dom.window.close(); }
  } finally { ui.dom.window.close(); }
});

test('atualiza e exclui comprador sem duplicar ou apagar cartões', async () => {
  const ui = setup();
  try {
    await ui.create();
    ui.set(buyer);
    ui.doc.querySelector('#buyer-label').value = 'Daniel';
    const id = await ui.save('buyer');
    ui.set({ buyerName: 'Daniel Corrigido' });
    ui.doc.querySelector('#buyer-label').value = 'Daniel atualizado';
    assert.equal(await ui.save('buyer'), id);
    assert.equal(ui.doc.querySelector('#buyer-profile').options.length, 2);
    ui.click('buyer-delete');
    await ui.wait(() => !ui.doc.querySelector('#buyer-save').disabled);
    assert.equal(ui.doc.querySelector('#buyer-profile').options.length, 1);
    assert.equal(ui.doc.querySelector('[name=buyerName]').value, '');
  } finally { ui.dom.window.close(); }
});
