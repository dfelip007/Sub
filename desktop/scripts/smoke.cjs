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
    await panel.waitForFunction(() => document.querySelector('#desktop-used').checked);
    assert.match(await panel.locator('#desktop-usage-state').textContent(), /Utilizado pela última vez em:/);
    const [firstUse] = await panel.evaluate(() => desktopBridge.usage(['00000000000']));
    assert.equal(firstUse.status, 'used');
    const disk = await fs.readFile(path.join(directory, 'profiles/profiles.json'), 'utf8');
    for (const value of ['0000000000001111', 'Daniel de Teste', 'cardCvv', 'checkoutVaultSession']) assert.equal(disk.includes(value), false);
    // Batch creation is usable for someone with 15+ browser profiles.
    await site.evaluate(() => { localStorage.setItem('profile-test', 'first'); document.cookie = 'profile_test=first; path=/; max-age=3600'; });
    await panel.locator('.desktop-toolbar details > summary').click();
    await panel.locator('#desktop-label').fill('Compras');
    await panel.locator('#desktop-quantity').fill('15');
    await panel.locator('#desktop-create').click();
    await panel.waitForFunction(() => document.querySelector('#desktop-profile').options.length === 16 && !document.querySelector('#desktop-open').disabled);
    const selectedProfile = await panel.locator('#desktop-profile').inputValue();
    assert.notEqual(selectedProfile, 'legacy');
    await panel.locator('#desktop-open').click();
    await panel.waitForFunction(() => document.querySelector('#desktop-target').value !== '');
    const newTabId = (await panel.evaluate(() => desktopBridge.checkout())).tab.id;
    const findWindow = async id => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        for (const page of instance.windows()) {
          const handle = await instance.browserWindow(page);
          if (await handle.evaluate(window => window.webContents.id) === id) {
            await page.waitForURL('http://127.0.0.1:8080/**');
            return page;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      throw new Error('Janela selecionada não encontrada.');
    };
    const second = await findWindow(newTabId);
    await second.waitForLoadState();
    assert.equal(await second.evaluate(() => localStorage.getItem('profile-test')), null);
    assert.equal(await second.evaluate(() => document.cookie.includes('profile_test=first')), false);
    await second.evaluate(() => { localStorage.setItem('profile-test', 'second'); document.cookie = 'profile_test=second; path=/; max-age=3600'; });
    assert.equal(await site.evaluate(() => localStorage.getItem('profile-test')), 'first');
    // Same-profile windows share login but only the explicitly selected window is filled.
    await panel.locator('#desktop-new-window').click();
    await panel.waitForFunction(() => document.querySelector('#desktop-target').options.length === 2);
    const thirdId = (await panel.evaluate(() => desktopBridge.checkout())).tab.id;
    const third = await findWindow(thirdId);
    await third.waitForLoadState();
    assert.equal(await third.evaluate(() => localStorage.getItem('profile-test')), 'second');
    assert.ok(await third.evaluate(() => document.cookie.includes('profile_test=second')));
    const cardId = await panel.locator('#card-profile').inputValue();
    await panel.locator('#card-profile').selectOption('');
    await panel.locator('#card-profile').selectOption(cardId);
    await panel.locator('[name=cardCvv]').fill('000');
    await panel.locator('#fill').click();
    await third.waitForFunction(() => document.querySelector('input[placeholder="Nome Completo"]').value === 'Daniel de Teste');
    await panel.waitForFunction(() => !document.querySelector('#fill').disabled && document.querySelector('[name=cardCvv]').value === '');
    assert.equal(await second.locator('input[placeholder="Nome Completo"]').inputValue(), '');
    assert.equal(await third.locator('#result').textContent(), '');
    const [lastUse] = await panel.evaluate(() => desktopBridge.usage(['000.000.000-00']));
    assert.ok(lastUse.at > firstUse.at, 'Reutilizar atualiza o horário sem bloquear, conforme solicitado.');
    // Manual marking can correct history, and duplicate buyer records share the CPF marker.
    panel.on('dialog', dialog => dialog.accept());
    await panel.locator('#desktop-used').uncheck();
    await panel.waitForFunction(() => document.querySelector('#desktop-usage-state').textContent.includes('ainda não'));
    assert.deepEqual(await panel.evaluate(() => desktopBridge.usage(['00000000000'])), [{ status: 'available' }]);
    await panel.locator('#desktop-used').check();
    await panel.waitForFunction(() => document.querySelector('#desktop-usage-state').textContent.includes('Utilizado pela'));
    await panel.locator('#buyer-editor > summary').click();
    await panel.locator('#buyer-new').click();
    await panel.locator('#buyer-label').fill('Daniel duplicado');
    await panel.locator('[name=buyerName]').fill('Daniel de Teste');
    await panel.locator('[name=cpf]').fill('000.000.000-00');
    await panel.locator('[name=birthDate]').fill('01/02/1990');
    await panel.locator('#buyer-save').click();
    await panel.waitForFunction(() => document.querySelector('#buyer-profile').options.length === 3 && !document.querySelector('#buyer-save').disabled);
    await panel.waitForFunction(() => [...document.querySelector('#buyer-profile').options].filter(option => option.textContent.includes('JÁ UTILIZADO')).length === 2);
    await panel.locator('#buyer-editor > summary').click();
    const operational = await fs.readFile(path.join(directory, 'profiles/workspace.json'), 'utf8');
    for (const value of ['00000000000', '000.000.000-00', 'Daniel de Teste', '0000000000001111', 'cardCvv']) assert.equal(operational.includes(value), false);
    // Leave a different destination selected and verify session/selection restoration.
    await panel.locator('#desktop-target').selectOption(String(newTabId));
    await panel.locator('#desktop-open').click();
    assert.equal((await panel.evaluate(() => desktopBridge.checkout())).tab.id, newTabId, 'Abrir/ver mantém a janela escolhida.');
    await panel.locator('.desktop-toolbar details > summary').click();
    await panel.screenshot({ path: path.join(root, 'test-results/desktop-panel.png'), fullPage: true });
    await third.screenshot({ path: path.join(root, 'test-results/desktop-checkout.png'), fullPage: true });
    await instance.close();
    instance = await launch();
    const reopened = await getPanel(instance);
    await reopened.locator('#vault-password').waitFor();
    await reopened.waitForFunction(() => document.querySelector('#vault-state').textContent === 'Bloqueado');
    assert.equal(await reopened.locator('#buyer-profile').isDisabled(), true);
    await reopened.locator('#vault-password').fill('senha-ficticia-teste');
    await reopened.locator('#vault-unlock').click();
    await reopened.waitForFunction(() => !document.querySelector('#buyer-profile').disabled);
    await reopened.waitForFunction(() => document.querySelector('#desktop-profile').options.length === 16);
    assert.equal(await reopened.locator('#desktop-profile').inputValue(), selectedProfile);
    await reopened.locator('#buyer-profile').selectOption({ label: 'Daniel · JÁ UTILIZADO' });
    await reopened.waitForFunction(() => document.querySelector('#desktop-used').checked);
    const restoredSite = instance.windows().find(page => page.url().startsWith('http://127.0.0.1:8080/'));
    await restoredSite.waitForLoadState();
    assert.equal(await restoredSite.evaluate(() => localStorage.getItem('profile-test')), 'second');
    assert.ok(await restoredSite.evaluate(() => document.cookie.includes('profile_test=second')));
    await reopened.locator('#card-profile').selectOption({ label: 'Principal · final 1111' });
    assert.equal(await reopened.locator('[name=cardNumber]').inputValue(), card.cardNumber);
    assert.equal(await reopened.locator('[name=cardCvv]').inputValue(), '');
    console.log('PASS: Electron real: 16 perfis persistentes, cookies isolados entre perfis e compartilhados no mesmo perfil, destino selecionado, 16 campos + seguro, horário por CPF (inclusive duplicado), marcação manual e reinício com cofre bloqueado. Compra não finalizada.');
  } finally {
    await instance?.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
