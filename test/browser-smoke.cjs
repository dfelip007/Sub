const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');

(async () => {
  const root = path.resolve(__dirname, '..');
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sub-chromium-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox']
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8080/checkout.html');
    await page.addScriptTag({ path: path.join(root, 'src/dates.js') });
    await page.addScriptTag({ path: path.join(root, 'src/fill.js') });
    const result = await page.evaluate(async () => {
      globalThis.purchaseSubmits = 0;
      document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); globalThis.purchaseSubmits++; });
      return globalThis.CheckoutAssist.fillCheckout({
        buyerName: 'Pessoa Teste', cpf: '00000000000', email: 'teste@example.invalid', phone: '11900000000', birthDate: '01/02/1990',
        cardNumber: '0000000000000000', cardHolder: 'PESSOA TESTE', cardExpiry: '12/30', cardCvv: '000',
        country: 'Brasil', postalCode: '00000000', city: 'Cidade Teste', state: 'SP', street: 'Rua Teste', streetNumber: '1', installments: '1'
      });
    });
    assert.deepEqual(result.pending, []);
    assert.equal(result.filled.length, 17);
    assert.equal(await page.locator('input[value=no]').isChecked(), true);
    assert.equal(await page.evaluate(() => globalThis.purchaseSubmits), 0);
    assert.equal(await page.locator('input[placeholder="CVV"]').inputValue(), '000');
    console.log('PASS: preenchimento de 16 campos + seguro no Chromium, sem finalizar compra.');

    await page.screenshot({ path: path.join(root, 'test-results/demo.png'), fullPage: true });
    const sources = {};
    for (const name of ['popup.html', 'popup.css', 'popup.js', 'import.js', 'dates.js', 'vault.js', 'profiles.js']) sources[name] = await fs.readFile(path.join(root, 'src', name), 'utf8');
    await context.route('http://127.0.0.1:8080/__extension__/**', async route => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1);
      if (!(name in sources)) { await route.abort(); return; }
      await route.fulfill({ body: sources[name], contentType: name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'application/javascript' });
    });
    const popup = await context.newPage();
    // Chrome APIs are simulated; WebCrypto, inputs and DOM are real Chromium APIs.
    await popup.addInitScript(() => {
      const area = (store, key) => ({
        async get(name) { const data = JSON.parse(store.getItem(key) || '{}'); return name ? { [name]: data[name] } : data; },
        async set(values) { const data = JSON.parse(store.getItem(key) || '{}'); store.setItem(key, JSON.stringify({ ...data, ...values })); },
        async remove(name) { const data = JSON.parse(store.getItem(key) || '{}'); delete data[name]; store.setItem(key, JSON.stringify(data)); },
        async setAccessLevel() {}
      });
      globalThis.chrome = { storage: { local: area(localStorage, 'mock.local'), session: area(sessionStorage, 'mock.session') } };
    });
    await popup.goto('http://127.0.0.1:8080/__extension__/popup.html');
    await popup.locator('#vault-password').fill('senha-ficticia-teste');
    await popup.locator('#vault-confirm').fill('senha-ficticia-teste');
    await popup.locator('#vault-unlock').click();
    await popup.waitForFunction(() => !document.querySelector('#buyer-save').disabled);
    await popup.locator('#buyer-editor > summary').click();
    await popup.locator('#buyer-label').fill('Daniel');
    await popup.locator('[name=buyerName]').fill('Daniel de Teste');
    await popup.locator('[name=cpf]').fill('00000000000');
    await popup.locator('[name=birthDate]').pressSequentially('01021990');
    assert.equal(await popup.locator('[name=birthDate]').inputValue(), '01/02/1990');
    await popup.locator('#buyer-save').click();
    await popup.waitForFunction(() => document.querySelector('#buyer-profile').options.length === 2 && !document.querySelector('#buyer-save').disabled);
    await popup.locator('#buyer-editor > summary').click();
    await popup.locator('#card-editor > summary').click();
    await popup.locator('#card-label').fill('Principal');
    await popup.locator('[name=cardNumber]').fill('0000000000001111');
    await popup.locator('[name=cardHolder]').fill('DANIEL TESTE');
    await popup.locator('[name=cardExpiry]').pressSequentially('1230');
    assert.equal(await popup.locator('[name=cardExpiry]').inputValue(), '12/30');
    await popup.locator('[name=cardCvv]').fill('000');
    await popup.locator('#card-save').click();
    await popup.waitForFunction(() => document.querySelector('#card-profile').options.length === 2 && !document.querySelector('#card-save').disabled);
    const disk = await popup.evaluate(() => localStorage.getItem('mock.local'));
    assert.equal(disk.includes('0000000000001111'), false);
    assert.equal(disk.includes('Daniel de Teste'), false);
    await popup.locator('#card-editor > summary').click();
    await popup.screenshot({ path: path.join(root, 'test-results/profiles.png'), fullPage: true });
    await popup.reload();
    await popup.waitForFunction(() => !document.querySelector('#buyer-profile').disabled);
    await popup.locator('#buyer-profile').selectOption({ label: 'Daniel' });
    await popup.locator('#card-profile').selectOption({ label: 'Principal · final 1111' });
    assert.equal(await popup.locator('[name=birthDate]').inputValue(), '01/02/1990');
    assert.equal(await popup.locator('[name=cardNumber]').inputValue(), '0000000000001111');
    assert.equal(await popup.locator('[name=cardCvv]').inputValue(), '');
    await popup.locator('#vault-lock').click();
    await popup.waitForFunction(() => document.querySelector('#buyer-profile').disabled);
    assert.equal(await popup.locator('[name=cardNumber]').inputValue(), '');
    console.log('PASS: máscaras na digitação, cofre com WebCrypto, perfis após reabrir, CVV descartado e bloqueio no Chromium (APIs Chrome simuladas).');
    console.log('Escopo: demonstração local e interface com APIs Chrome simuladas. Instalação da extensão e checkout real não são cobertos por este teste.');
  } finally {
    await context.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
