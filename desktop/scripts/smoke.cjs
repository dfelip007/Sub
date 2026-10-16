'use strict';
const { _electron } = require('../../node_modules/playwright-core');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meaple-app-test-'));
  const fixture = await fs.readFile(path.join(root, 'demo/checkout.html'));
  const demoScript = await fs.readFile(path.join(root, 'demo/demo.js'));
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/demo.js' ? 'application/javascript' : 'text/html; charset=utf-8');
    response.end(request.url === '/demo.js' ? demoScript : fixture);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8080, '127.0.0.1', resolve); });
  const launch = () => _electron.launch({
    executablePath: require('electron'),
    args: [path.join(root, 'desktop/app/main.cjs'), '--smoke-test', `--test-data=${directory}`, '--no-sandbox'],
    env: { ...process.env, XDG_CACHE_HOME: '/tmp/sub-desktop-cache' },
    timeout: 30000
  });
  let instance;
  async function getPanel(app) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const panel = app.windows().find(page => page.url() === 'app://manager/popup.html');
      if (panel) return panel;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Painel local não abriu.');
  }
  try {
    instance = await launch();
    const panel = await getPanel(instance);
    await panel.waitForSelector('#vault-password');
    await panel.locator('#vault-password').fill('senha-ficticia-teste');
    await panel.locator('#vault-confirm').fill('senha-ficticia-teste');
    await panel.locator('#vault-unlock').click();
    await panel.waitForFunction(() => !document.querySelector('#buyer-save').disabled);
    await panel.locator('#contact-editor > summary').click();
    await panel.locator('[name=email]').fill('contato@example.invalid');
    await panel.locator('[name=phone]').fill('11900000000');
    await panel.locator('#save-contact').click();
    await panel.locator('#contact-editor > summary').click();
    await panel.locator('#buyer-editor > summary').click();
    await panel.locator('#buyer-label').fill('Daniel');
    await panel.locator('[name=buyerName]').fill('Daniel de Teste');
    await panel.locator('[name=cpf]').fill('00000000000');
    await panel.locator('[name=birthDate]').pressSequentially('01021990');
    assert.equal(await panel.locator('[name=birthDate]').inputValue(), '01/02/1990');
    await panel.locator('#buyer-save').click();
    await panel.waitForFunction(() => document.querySelector('#buyer-profile').options.length === 2 && !document.querySelector('#buyer-save').disabled);
    await panel.locator('#buyer-editor > summary').click();
    await panel.locator('#card-editor > summary').click();
    await panel.locator('#card-label').fill('Principal');
    const card = { cardNumber: '0000000000001111', cardHolder: 'PESSOA TESTE', country: 'Brasil', postalCode: '00000000', city: 'Cidade Teste', state: 'SP', street: 'Rua Teste', streetNumber: '1' };
    for (const [name, value] of Object.entries(card)) await panel.locator(`[name=${name}]`).fill(value);
    await panel.locator('[name=cardExpiry]').pressSequentially('1230');
    assert.equal(await panel.locator('[name=cardExpiry]').inputValue(), '12/30');
    await panel.locator('#card-save').click();
    await panel.waitForFunction(() => document.querySelector('#card-profile').options.length === 2 && !document.querySelector('#card-save').disabled);
    await panel.locator('#card-editor > summary').click();
    await panel.locator('[name=cardCvv]').fill('000');
    await panel.locator('[name=installments]').selectOption('1');
    const site = instance.windows().find(page => page.url().startsWith('http://127.0.0.1:8080/'));
    assert.ok(site, 'Janela do site deve estar aberta.');
    assert.equal(await site.evaluate(() => typeof globalThis.desktopBridge), 'undefined');
    assert.equal(await site.evaluate(() => typeof require), 'undefined');
    await panel.locator('#fill').click();
    await panel.waitForFunction(() => document.querySelector('#status').textContent.includes('17 itens preenchidos'), { timeout: 10000 });
    assert.equal(await site.locator('input[placeholder="Nome Completo"]').inputValue(), 'Daniel de Teste');
    assert.equal(await site.locator('input[placeholder="dd/mm/aaaa"]').inputValue(), '01/02/1990');
    assert.equal(await site.locator('input[placeholder="MM/AA"]').inputValue(), '12/30');
    assert.equal(await site.locator('input[value=no]').isChecked(), true);
    assert.equal(await site.locator('#result').textContent(), '');
    assert.equal(await site.evaluate(() => typeof globalThis.CheckoutAssist), 'undefined', 'Motor deve executar em mundo isolado.');
    assert.equal(await panel.locator('[name=cardCvv]').inputValue(), '');
    const disk = await fs.readFile(path.join(directory, 'profiles/profiles.json'), 'utf8');
    for (const value of ['0000000000001111', 'Daniel de Teste', 'cardCvv', 'checkoutVaultSession']) assert.equal(disk.includes(value), false);
    await panel.screenshot({ path: path.join(root, 'test-results/desktop-panel.png'), fullPage: true });
    await site.screenshot({ path: path.join(root, 'test-results/desktop-checkout.png'), fullPage: true });
    await instance.close();
    instance = await launch();
    const reopened = await getPanel(instance);
    await reopened.locator('#vault-password').waitFor();
    await reopened.waitForFunction(() => document.querySelector('#vault-state').textContent === 'Bloqueado');
    assert.equal(await reopened.locator('#buyer-profile').isDisabled(), true);
    await reopened.locator('#vault-password').fill('senha-ficticia-teste');
    await reopened.locator('#vault-unlock').click();
    await reopened.waitForFunction(() => !document.querySelector('#buyer-profile').disabled);
    await reopened.locator('#buyer-profile').selectOption({ label: 'Daniel' });
    await reopened.locator('#card-profile').selectOption({ label: 'Principal · final 1111' });
    assert.equal(await reopened.locator('[name=cardNumber]').inputValue(), card.cardNumber);
    assert.equal(await reopened.locator('[name=cardCvv]').inputValue(), '');
    console.log('PASS: Electron real abriu painel e site, preencheu 16 campos + seguro por IPC isolado, preservou perfis criptografados e bloqueou após reiniciar. Compra não finalizada.');
  } finally {
    await instance?.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
