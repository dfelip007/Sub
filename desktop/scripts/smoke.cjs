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
  const ticketSummary = '<aside id="ticket-summary"><h2>Resumo da compra</h2><p>Evento: Submundo teste</p><article><h3>Pista inteira</h3><p class="fixture-lot">1º lote</p><p>Quantidade: 2</p><p>Valor unitário: R$ 50,00</p></article><article><h3>Pista meia</h3><p>2º lote</p><p>Quantidade: 1</p><p>Valor unitário: R$ 10,00</p></article><p>Taxas: R$ 13,45</p><p>Total: R$ 123,45</p></aside>';
  const fixture = (await fs.readFile(path.join(root, 'demo/checkout.html'), 'utf8')).replace('<form id="checkout">', `<aside id="cart-deadline">Seu carrinho expira em <strong id="cart-counter">09:58</strong></aside>${ticketSummary}<form id="checkout">`);
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
    // Timer detection starts on checkout load, even with the vault still locked.
    await panel.waitForFunction(() => document.querySelector('#cart-time')?.textContent === '09:58');
    const site = instance.windows().find(page => page.url().startsWith('http://127.0.0.1:8080/'));
    assert.ok(site, 'Janela do site deve estar aberta.');
    await site.locator('#cart-counter').evaluate(element => { element.textContent = '01:59'; });
    await panel.waitForFunction(() => document.querySelector('#cart-time').textContent === '01:59' && document.querySelector('#cart-clock').dataset.urgency === 'urgent');
    await site.locator('#cart-counter').evaluate(element => { element.textContent = '09:58'; });
    await panel.waitForFunction(() => document.querySelector('#cart-time').textContent === '09:58');
    await panel.locator('.brand-logo').waitFor();
    await panel.waitForFunction(() => { const image = document.querySelector('.brand-logo'); return image.complete && image.naturalWidth > 0; });
    assert.match(await panel.title(), /Submundo/);
    assert.equal(await instance.evaluate(({ app }) => app.getName()), 'Submundo Compras');
    panel.on('dialog', dialog => dialog.accept());
    const nav = async view => panel.locator(`.sidebar [data-view=${view}]`).click();
    await panel.waitForSelector('#vault-password');
    await panel.locator('#vault-password').fill('0042');
    assert.equal(await panel.locator('#vault-password').getAttribute('maxlength'), '4');
    await panel.locator('#vault-confirm').fill('0042');
    await panel.locator('#vault-unlock').click();
    await panel.waitForFunction(() => document.querySelector('#vault-panel').hidden);
    await panel.waitForFunction(() => document.querySelector('#ticket-event').value === 'Submundo teste' && document.querySelectorAll('#ticket-rows .ticket-line').length === 2);
    assert.equal(await panel.locator('#ticket-rows [data-ticket-field=unit]').first().inputValue(), '50,00');
    assert.equal(await panel.locator('#purchase-amount').inputValue(), '123,45');
    const remaining = await panel.evaluate(async () => (await desktopBridge.read('session', 'checkoutVaultSession')).checkoutVaultSession.expiresAt - Date.now());
    assert.ok(remaining > 1795000 && remaining <= 1800000, 'Desbloqueio dura 30 minutos.');
    await nav('settings');
    await panel.locator('#contact-form [name=email]').fill('contato@example.invalid');
    await panel.locator('#contact-form [name=phone]').fill('11900000000');
    await panel.locator('#save-contact').click();
    await nav('buyers');
    await panel.locator('#view-buyers [data-new=buyer]').click();
    await panel.locator('#buyer-label').fill('Daniel');
    await panel.locator('[name=buyerName]').fill('Daniel de Teste');
    await panel.locator('[name=cpf]').fill('00000000000');
    await panel.locator('[name=birthDate]').pressSequentially('01021990');
    assert.equal(await panel.locator('[name=birthDate]').inputValue(), '01/02/1990');
    await panel.locator('#buyer-save').click();
    await panel.waitForFunction(() => document.querySelector('#buyer-editor').hidden);
    await nav('cards');
    await panel.locator('#view-cards [data-new=card]').click();
    await panel.locator('#card-label').fill('Principal');
    await panel.locator('#card-available').fill('1.000,00');
    const card = { cardNumber: '0000000000001111', cardHolder: 'PESSOA TESTE', country: 'Brasil', postalCode: '00000000', city: 'Cidade Teste', state: 'SP', street: 'Rua Teste', streetNumber: '1' };
    for (const [name, value] of Object.entries(card)) await panel.locator(`[name=${name}]`).fill(value);
    await panel.locator('[name=cardExpiry]').pressSequentially('1230');
    assert.equal(await panel.locator('[name=cardExpiry]').inputValue(), '12/30');
    await panel.locator('[name=savedCvv]').fill('987');
    await panel.locator('#card-save-cvv').check();
    await panel.locator('#card-save').click();
    await panel.waitForFunction(() => document.querySelector('#card-editor').hidden);
    assert.match(await panel.locator('#cards-list').textContent(), /1.000,00/);
    assert.equal(await panel.locator('#cards-list [name=cardNumber]').count(), 0);
    assert.equal((await panel.locator('#cards-list').textContent()).includes(card.cardNumber), false);
    await panel.screenshot({ path: path.join(root, 'test-results/desktop-cards.png'), fullPage: true });
    await nav('buy');
    await panel.locator('#purchase-amount').fill('123,45');
    await panel.locator('#purchase-installments').selectOption('2');
    assert.equal(await panel.locator('#purchase-cvv').inputValue(), '987');
    assert.equal(await site.evaluate(() => typeof globalThis.desktopBridge), 'undefined');
    assert.equal(await site.evaluate(() => typeof require), 'undefined');
    await panel.locator('#fill').click();
    await panel.waitForFunction(() => document.querySelector('#status').textContent.includes('17 itens preenchidos') && !document.querySelector('#fill').disabled);
    assert.equal(await site.locator('input[placeholder="Nome Completo"]').inputValue(), 'Daniel de Teste');
    assert.equal(await site.locator('input[placeholder="dd/mm/aaaa"]').inputValue(), '01/02/1990');
    assert.equal(await site.locator('input[placeholder="MM/AA"]').inputValue(), '12/30');
    assert.equal(await site.locator('input[placeholder="CVV"]').inputValue(), '987');
    assert.equal(await site.locator('input[value=no]').isChecked(), true);
    assert.equal(await site.locator('#result').textContent(), '');
    assert.equal(await site.evaluate(() => typeof globalThis.CheckoutAssist), 'undefined');
    assert.equal(await panel.locator('#purchase-cvv').inputValue(), '');
    assert.match(await panel.locator('#buy-balance').textContent(), /1.000,00/, 'Preencher não desconta.');
    await panel.waitForFunction(() => document.querySelector('#desktop-used').checked);
    assert.match(await panel.locator('#desktop-usage-state').textContent(), /Utilizado pela última vez em:/);
    const [firstUse] = await panel.evaluate(() => desktopBridge.usage(['00000000000']));
    await panel.locator('#fill').click();
    await panel.waitForFunction(() => !document.querySelector('#fill').disabled && document.querySelector('#status').textContent.includes('17 itens'));
    assert.equal(await panel.locator('#pending-orders [data-confirm-order]').count(), 1, 'Repetir preenchimento reaproveita a pendência.');
    await nav('tickets');
    assert.equal(await panel.locator('#tickets-stock .stock-order').count(), 0, 'Preencher não cria estoque pago.');
    await nav('buy');
    // A confirmation belongs to its original card, even when another one is selected later.
    await panel.locator('#pending-orders [data-confirm-order]').click();
    await panel.locator('#order-reference').fill('PEDIDO-FICTICIO-1');
    await panel.locator('#order-confirm').dblclick();
    await panel.waitForFunction(() => !document.querySelector('#order-dialog').open && !document.querySelector('#fill').disabled);
    assert.match(await panel.locator('#buy-balance').textContent(), /876,55/);
    await nav('tickets');
    assert.match(await panel.locator('#tickets-totals').textContent(), /3 ingressos/);
    assert.match(await panel.locator('#tickets-stock').textContent(), /112,23/);
    await panel.locator('#tickets-stock .stock-line input').first().fill('80,00');
    await panel.locator('#tickets-stock .stock-line input').nth(1).fill('20,00');
    await panel.locator('#tickets-stock [data-save-resale]').first().click();
    await panel.waitForFunction(() => document.querySelector('#tickets-stock').textContent.includes('47,77'));
    assert.equal(await panel.locator('#tickets-stock .stock-line input').nth(1).inputValue(), '20,00', 'Salvar uma linha preserva a edição ainda não salva de outra.');
    const csvPath = path.join(directory, 'ingressos.csv');
    await instance.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, csvPath);
    await panel.locator('#tickets-export').click();
    await panel.waitForFunction(() => document.querySelector('#message').textContent.includes('CSV exportado'));
    const csv = await fs.readFile(csvPath, 'utf8');
    assert.match(csv, /Submundo teste/); assert.match(csv, /1º lote/); assert.match(csv, /80,00/);
    assert.equal(csv.includes('"20,00"'), false, 'CSV usa apenas preços já salvos.');
    assert.equal(csv.includes(card.cardNumber), false); assert.equal(csv.includes('00000000000'), false);
    // Correcting product metadata must preserve the paid amount and card balance.
    await panel.locator('#tickets-stock [data-edit-tickets]').click();
    await panel.locator('#ticket-edit-rows [data-ticket-field=lot]').first().fill('Lote corrigido');
    await panel.locator('#ticket-edit-save').click();
    await panel.waitForFunction(() => !document.querySelector('#ticket-dialog').open && document.querySelector('#tickets-stock').textContent.includes('Lote corrigido'));
    assert.equal(await panel.locator('#tickets-stock .stock-line input').first().inputValue(), '80,00');
    await panel.screenshot({ path: path.join(root, 'test-results/desktop-tickets.png'), fullPage: true });
    await nav('history');
    assert.equal(await panel.locator('#history-list [data-reverse-order]').count(), 1);
    await panel.screenshot({ path: path.join(root, 'test-results/desktop-history.png'), fullPage: true });
    await panel.locator('#history-list [data-reverse-order]').click();
    await panel.waitForFunction(() => document.querySelector('#history-list').textContent.includes('Registro desfeito'));
    await nav('tickets'); assert.equal(await panel.locator('#tickets-stock .stock-order').count(), 0);
    await nav('buy');
    assert.match(await panel.locator('#buy-balance').textContent(), /1.000,00/, 'Desfazer devolve o valor uma vez.');
    // Create another pending purchase and confirm only after a full application restart.
    await panel.locator('#fill').click();
    await panel.waitForFunction(() => !document.querySelector('#fill').disabled && document.querySelector('#pending-orders [data-confirm-order]'));
    await site.evaluate(() => { localStorage.setItem('profile-test', 'first'); document.cookie = 'profile_test=first; path=/; max-age=3600'; });
    await nav('browsers');
    await panel.locator('#desktop-label').fill('Compras');
    await panel.locator('#desktop-quantity').fill('15');
    await panel.locator('#desktop-create').click();
    await panel.waitForFunction(() => document.querySelector('#desktop-profile').options.length === 16 && !document.querySelector('#desktop-create').disabled);
    const selectedProfile = await panel.locator('#desktop-profile').inputValue();
    await nav('buy');
    await panel.locator('#desktop-open').click();
    await panel.waitForFunction(() => document.querySelector('#desktop-target').value !== '');
    const newTabId = (await panel.evaluate(() => desktopBridge.checkout())).tab.id;
    const findWindow = async id => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        for (const page of instance.windows()) {
          const handle = await instance.browserWindow(page);
          if (await handle.evaluate(window => window.webContents.id) === id) { await page.waitForURL('http://127.0.0.1:8080/**'); return page; }
        }
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      throw new Error('Janela selecionada não encontrada.');
    };
    const second = await findWindow(newTabId); await second.waitForLoadState();
    assert.equal(await second.evaluate(() => localStorage.getItem('profile-test')), null);
    assert.equal(await second.evaluate(() => document.cookie.includes('profile_test=first')), false);
    await second.evaluate(() => { localStorage.setItem('profile-test', 'second'); document.cookie = 'profile_test=second; path=/; max-age=3600'; });
    await nav('browsers'); await panel.locator('#desktop-new-window').click();
    await panel.waitForFunction(() => document.querySelector('#desktop-target').options.length === 2);
    const thirdId = (await panel.evaluate(() => desktopBridge.checkout())).tab.id;
    const third = await findWindow(thirdId); await third.waitForLoadState();
    await second.locator('#cart-counter').evaluate(element => { element.textContent = '01:30'; });
    await third.locator('#cart-counter').evaluate(element => { element.textContent = '03:45'; });
    await third.locator('.fixture-lot').evaluate(element => { element.textContent = '3º lote'; });
    await panel.waitForFunction(({ secondId, thirdId }) => document.querySelector('#cart-time').textContent === '03:45'
      && document.querySelector(`[data-tab="${secondId}"] .cart-row-time`).textContent === '01:30'
      && document.querySelector(`[data-tab="${thirdId}"] .cart-row-time`).textContent === '03:45', { secondId: newTabId, thirdId });
    await panel.locator('#cart-overview summary').click();
    await panel.locator(`[data-cart-tab="${newTabId}"]`).click();
    await panel.waitForFunction(() => document.querySelector('#cart-time').textContent === '01:30');
    await second.locator('#cart-counter').evaluate(element => { element.textContent = '00:00'; });
    await panel.waitForFunction(() => document.querySelector('#cart-time').textContent === '00:00' && document.querySelector('#cart-clock').dataset.urgency === 'expired');
    await second.evaluate(() => { document.querySelector('#cart-deadline').hidden = true; history.pushState({}, '', '/checkout/sem-contador'); });
    await panel.waitForFunction(() => document.querySelector('#cart-time').textContent === '—' && document.querySelector('#cart-time-state').textContent === 'Tempo não identificado');
    // An HTTPS payment-provider window must not be inspected, even if its text looks identical.
    await second.route('https://provider.example.invalid/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Seu carrinho expira em 10:00</p>' }));
    await second.goto('https://provider.example.invalid/payment');
    await panel.waitForFunction(async () => (await desktopBridge.checkout()).tab.url.startsWith('https://provider.example.invalid/'));
    assert.equal(await panel.locator('#cart-time').textContent(), '—');
    await assert.rejects(panel.evaluate(id => desktopBridge.tickets(id), newTabId), /checkout da Meaple/);
    await second.goto('http://127.0.0.1:8080/checkout.html');
    await panel.waitForFunction(() => document.querySelector('#cart-time').textContent === '09:58');
    await panel.locator(`[data-cart-tab="${thirdId}"]`).click();
    await panel.waitForFunction(() => document.querySelector('#cart-time').textContent === '03:45');
    await panel.locator('#ticket-refresh').click();
    await panel.waitForFunction(() => document.querySelector('#ticket-rows [data-ticket-field=lot]')?.value === '3º lote');
    await panel.locator('#ticket-event').fill('Submundo manual');
    await panel.locator(`[data-cart-tab="${newTabId}"]`).click();
    await panel.waitForFunction(() => document.querySelector('#ticket-event').value === 'Submundo teste');
    await panel.locator(`[data-cart-tab="${thirdId}"]`).click();
    await panel.waitForFunction(() => document.querySelector('#ticket-event').value === 'Submundo manual');
    await panel.locator(`[data-cart-tab="${thirdId}"]`).focus();
    await third.locator('#cart-counter').evaluate(element => { element.textContent = '03:44'; });
    await panel.waitForFunction(() => document.querySelector('#cart-time').textContent === '03:44');
    assert.equal(await panel.evaluate(() => document.activeElement.dataset.cartTab), String(thirdId), 'Atualizações não recriam os botões nem tiram o foco.');
    assert.equal(await third.evaluate(() => localStorage.getItem('profile-test')), 'second');
    assert.ok(await third.evaluate(() => document.cookie.includes('profile_test=second')));
    await panel.locator('#fill').click();
    await panel.waitForFunction(() => !document.querySelector('#fill').disabled && document.querySelector('#status').textContent.includes('17 itens'));
    assert.equal(await third.locator('input[placeholder="Nome Completo"]').inputValue(), 'Daniel de Teste');
    assert.equal(await second.locator('input[placeholder="Nome Completo"]').inputValue(), '');
    assert.equal(await third.locator('#result').textContent(), '');
    const [lastUse] = await panel.evaluate(() => desktopBridge.usage(['000.000.000-00']));
    assert.ok(lastUse.at > firstUse.at);
    await panel.locator('#desktop-used').uncheck();
    await panel.waitForFunction(() => document.querySelector('#desktop-usage-state').textContent.includes('ainda não'));
    await panel.locator('#desktop-used').check();
    await panel.waitForFunction(() => document.querySelector('#desktop-usage-state').textContent.includes('Utilizado pela'));
    await nav('buyers'); await panel.locator('#view-buyers [data-new=buyer]').click();
    await panel.locator('#buyer-label').fill('Daniel duplicado');
    await panel.locator('[name=buyerName]').fill('Daniel de Teste');
    await panel.locator('[name=cpf]').fill('000.000.000-00');
    await panel.locator('[name=birthDate]').fill('01/02/1990');
    await panel.locator('#buyer-save').click();
    await panel.waitForFunction(() => document.querySelector('#buyer-editor').hidden && document.querySelector('#buyer-profile').options.length === 3);
    await panel.waitForFunction(() => [...document.querySelector('#buyer-profile').options].filter(option => option.textContent.includes('JÁ UTILIZADO')).length === 2);
    await nav('buy');
    await panel.locator('#desktop-target').selectOption(String(newTabId));
    await panel.locator('#desktop-open').click();
    assert.equal((await panel.evaluate(() => desktopBridge.checkout())).tab.id, newTabId);
    const disk = await fs.readFile(path.join(directory, 'profiles/profiles.json'), 'utf8');
    for (const value of [card.cardNumber, 'Daniel de Teste', 'cardCvv', 'PEDIDO-FICTICIO-1', 'budgetCents', 'checkoutVaultSession']) assert.equal(disk.includes(value), false);
    const operational = await fs.readFile(path.join(directory, 'profiles/workspace.json'), 'utf8');
    for (const value of ['00000000000', '000.000.000-00', card.cardNumber, 'cardCvv', 'budgetCents', 'PEDIDO-FICTICIO-1']) assert.equal(operational.includes(value), false);
    await panel.screenshot({ path: path.join(root, 'test-results/desktop-panel.png'), fullPage: true });
    await third.screenshot({ path: path.join(root, 'test-results/desktop-checkout.png'), fullPage: true });
    await second.close();
    await panel.waitForFunction(() => document.querySelectorAll('#cart-list .cart-row').length === 2 && document.querySelector('#cart-time').textContent === '03:44');
    // Lock clears current sensitive forms and lists, not just their visibility.
    await panel.locator('#vault-lock').click();
    await panel.waitForFunction(() => document.querySelector('#vault-panel').hidden === false);
    assert.equal(await panel.locator('[name=cardNumber]').inputValue(), '');
    assert.equal(await panel.locator('[name=savedCvv]').inputValue(), '');
    assert.equal(await panel.locator('#purchase-cvv').inputValue(), '');
    assert.equal(await panel.locator('#ticket-event').inputValue(), '');
    assert.equal(await panel.locator('#ticket-rows .ticket-line').count(), 0);
    assert.equal((await panel.locator('#cards-list').textContent()).includes('1111'), false);
    await instance.close(); instance = await launch();
    const reopened = await getPanel(instance); reopened.on('dialog', dialog => dialog.accept());
    await reopened.waitForFunction(() => document.querySelector('#vault-state').textContent === 'Cofre bloqueado');
    assert.equal(await reopened.locator('#buyer-profile').isDisabled(), true);
    await reopened.locator('#vault-password').fill('0042');
    await reopened.locator('#vault-unlock').click();
    await reopened.waitForFunction(() => document.querySelector('#vault-panel').hidden && !document.querySelector('#buyer-profile').disabled);
    assert.equal(await reopened.locator('#desktop-profile').inputValue(), selectedProfile);
    await reopened.locator('#buyer-profile').selectOption({ label: 'Daniel · JÁ UTILIZADO' });
    await reopened.locator('#card-profile').selectOption({ label: 'Principal · final 1111' });
    assert.equal(await reopened.locator('#purchase-cvv').inputValue(), '987');
    assert.match(await reopened.locator('#buy-balance').textContent(), /1.000,00/);
    assert.equal(await reopened.locator('#pending-orders [data-confirm-order]').count(), 2);
    assert.match(await reopened.locator('#pending-orders').textContent(), /Submundo manual/);
    const restoredSite = instance.windows().find(page => page.url().startsWith('http://127.0.0.1:8080/')); await restoredSite.waitForLoadState();
    assert.equal(await restoredSite.evaluate(() => localStorage.getItem('profile-test')), 'second');
    assert.ok(await restoredSite.evaluate(() => document.cookie.includes('profile_test=second')));
    await reopened.locator('#pending-orders [data-confirm-order]').first().click();
    await reopened.locator('#order-confirm').click();
    await reopened.waitForFunction(() => !document.querySelector('#order-dialog').open);
    assert.match(await reopened.locator('#buy-balance').textContent(), /876,55/);
    // Turning off saved CVV removes it, while editing available balance preserves history.
    await reopened.locator('.sidebar [data-view=cards]').click();
    await reopened.locator('#cards-list [data-edit-card]').click();
    assert.equal(await reopened.locator('[name=savedCvv]').inputValue(), '987');
    assert.equal(await reopened.locator('#card-available').inputValue(), '876,55');
    await reopened.locator('#card-save-cvv').uncheck();
    await reopened.locator('#card-save').click();
    await reopened.waitForFunction(() => document.querySelector('#card-editor').hidden);
    await reopened.locator('#vault-lock').click();
    await reopened.locator('#vault-password').fill('0042');
    await reopened.locator('#vault-unlock').click();
    await reopened.waitForFunction(() => document.querySelector('#vault-panel').hidden);
    await reopened.locator('.sidebar [data-view=buy]').click();
    await reopened.locator('#card-profile').selectOption({ label: 'Principal · final 1111' });
    assert.equal(await reopened.locator('#purchase-cvv').inputValue(), '');
    assert.match(await reopened.locator('#buy-balance').textContent(), /876,55/);
    // Native expiry must clear the new UI, including an open card editor.
    await reopened.locator('.sidebar [data-view=cards]').click();
    await reopened.locator('#cards-list [data-edit-card]').click();
    assert.equal(await reopened.locator('[name=cardNumber]').inputValue(), card.cardNumber);
    await reopened.evaluate(async () => {
      const { checkoutVaultSession } = await desktopBridge.read('session', 'checkoutVaultSession');
      await desktopBridge.write('session', { checkoutVaultSession: { ...checkoutVaultSession, expiresAt: Date.now() + 80 } });
    });
    await reopened.waitForFunction(() => !document.querySelector('#vault-panel').hidden && document.querySelector('[name=cardNumber]').value === '');
    assert.equal(await reopened.locator('[name=savedCvv]').inputValue(), '');
    assert.equal(await reopened.locator('#purchase-cvv').inputValue(), '');
    // Open one event in all 16 profiles, even with the vault locked. Existing
    // carts stay untouched, repeat clicks reuse event windows, cookies stay isolated.
    await restoredSite.locator('input[placeholder="Nome Completo"]').fill('Carrinho preservado');
    const beforeBulk = await reopened.evaluate(() => desktopBridge.checkout());
    await reopened.locator('.sidebar [data-view=browsers]').click();
    await reopened.locator('#browser-event-link').fill('https://meaple.com.br.evil.invalid/evento');
    await reopened.locator('#view-browsers [data-open-all]').click();
    await reopened.waitForFunction(() => document.querySelector('#message').textContent.includes('link HTTPS da Meaple'));
    assert.equal((await reopened.evaluate(() => desktopBridge.checkout())).tabs.length, beforeBulk.tabs.length);
    const eventUrl = 'http://127.0.0.1:8080/evento/submundo?lote=1';
    await reopened.locator('#browser-event-link').fill(eventUrl);
    assert.equal(await reopened.locator('#event-link').inputValue(), eventUrl);
    await reopened.locator('#view-browsers [data-open-all]').click();
    await reopened.waitForFunction(async () => { const state = await desktopBridge.checkout(); return state.launch.processed === 16 && !state.launch.running && !document.querySelector('#view-browsers [data-open-all]').disabled; });
    const bulk = await reopened.evaluate(() => desktopBridge.checkout());
    assert.equal(bulk.launch.created, 16); assert.equal(bulk.launch.reused, 0); assert.deepEqual(bulk.launch.failed, []);
    assert.equal(bulk.profileId, beforeBulk.profileId); assert.equal(bulk.tab.id, beforeBulk.tab.id);
    assert.equal(bulk.tabs.length, beforeBulk.tabs.length + 16);
    // The native state initially reports in-flight URLs as HOME, so wait for
    // actual navigation before checking one event window per profile.
    await reopened.waitForFunction(async url => { const state = await desktopBridge.checkout(); return state.tabs.filter(tab => tab.url === url).length === 16 && state.tabs.filter(tab => tab.url === url).every(tab => !tab.loading); }, eventUrl);
    const loaded = await reopened.evaluate(() => desktopBridge.checkout());
    for (const profile of loaded.profiles) assert.equal(loaded.tabs.filter(tab => tab.profileId === profile.id && tab.url === eventUrl).length, 1);
    assert.equal(restoredSite.url(), 'http://127.0.0.1:8080/checkout.html');
    assert.equal(await restoredSite.locator('input[placeholder="Nome Completo"]').inputValue(), 'Carrinho preservado');
    const cookies = await instance.evaluate(async ({ webContents }, { tabs, url }) => Promise.all(tabs.map(async tab => ({ profileId: tab.profileId, cookies: await webContents.fromId(tab.id).session.cookies.get({ url }) }))), { tabs: loaded.tabs.filter(tab => tab.url === eventUrl), url: eventUrl });
    for (const item of cookies) {
      const value = item.cookies.find(cookie => cookie.name === 'profile_test')?.value;
      assert.equal(value, item.profileId === 'legacy' ? 'first' : item.profileId === selectedProfile ? 'second' : undefined);
    }
    // Enter in the link field also launches; it must not submit the buyer form.
    await reopened.locator('.sidebar [data-view=buy]').click();
    await reopened.locator('#event-link').press('Enter');
    await reopened.waitForFunction(async () => { const state = await desktopBridge.checkout(); return state.launch.created === 0 && state.launch.reused === 16 && !state.launch.running; });
    assert.deepEqual((await reopened.evaluate(() => desktopBridge.checkout())).tabs.map(tab => tab.id).sort(), loaded.tabs.map(tab => tab.id).sort());
    const advancedId = loaded.tabs.find(tab => tab.url === eventUrl && tab.profileId === selectedProfile).id;
    const advanced = await findWindow(advancedId);
    await advanced.goto('http://127.0.0.1:8080/checkout/carrinho-em-andamento');
    await advanced.locator('input[placeholder="Nome Completo"]').fill('Outro carrinho preservado');
    await reopened.locator('#view-buy [data-open-all]').click();
    await reopened.waitForFunction(async () => { const state = await desktopBridge.checkout(); return state.launch.created === 1 && state.launch.reused === 15 && !state.launch.running; });
    assert.equal((await reopened.evaluate(() => desktopBridge.checkout())).tabs.length, loaded.tabs.length + 1);
    assert.equal(await advanced.locator('input[placeholder="Nome Completo"]').inputValue(), 'Outro carrinho preservado');
    assert.equal(advanced.url(), 'http://127.0.0.1:8080/checkout/carrinho-em-andamento');
    await reopened.screenshot({ path: path.join(root, 'test-results/desktop-open-all.png'), fullPage: true });
    // Narrow window must keep all navigation/actions accessible without horizontal scrolling.
    await instance.evaluate(({ BrowserWindow }) => { const panel = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('app://')); panel.setSize(780, 760); });
    await reopened.waitForFunction(() => window.innerWidth < 800);
    assert.ok(await reopened.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    // Exercise the normal startup branch after rebranding with an existing vault.
    // HTTPS is canceled in this test, so the production homepage is never contacted.
    await instance.close();
    const appData = path.join(directory, 'legacy-app-data');
    const legacyUserData = path.join(appData, 'Meaple Preenchimento');
    await fs.mkdir(legacyUserData, { recursive: true });
    await fs.cp(path.join(directory, 'profiles'), path.join(legacyUserData, 'profiles'), { recursive: true });
    // Seed a vault protected by the previous long password while preserving all
    // existing financial records, then migrate it through the real settings UI.
    const { Store } = require('../app/store.cjs');
    const oldStore = new Store(path.join(legacyUserData, 'profiles'));
    const area = name => ({ get: key => oldStore.get(name, key), set: values => oldStore.update(name, values), remove: key => oldStore.update(name, key, true), async setAccessLevel() {} });
    const context = require('node:vm').createContext({ crypto: require('node:crypto').webcrypto, TextEncoder, TextDecoder, structuredClone, btoa, atob, Date });
    require('node:vm').runInContext(await fs.readFile(path.join(root, 'src/vault.js'), 'utf8'), context);
    const oldVault = new context.CheckoutVault.Vault({ local: area('local'), session: area('session') });
    try { await oldVault.unlock('0042'); await oldVault.changePassword('senha-legada-ficticia'); await oldVault.lock(); }
    finally { oldStore.close(); }
    const bootstrap = path.join(directory, 'branding-startup.cjs');
    await fs.writeFile(bootstrap, `const { app } = require('electron');
app.disableHardwareAcceleration();
app.setPath('appData', ${JSON.stringify(appData)});
app.on('web-contents-created', (_event, contents) => contents.session.webRequest.onBeforeRequest({ urls: ['https://*/*'] }, (_request, callback) => callback({ cancel: true })));
require(${JSON.stringify(path.join(root, 'desktop/app/main.cjs'))});`);
    instance = await _electron.launch({ executablePath: require('electron'), args: [bootstrap, '--no-sandbox'], env: { ...process.env, XDG_CACHE_HOME: '/tmp/sub-desktop-cache' }, timeout: 30000 });
    const branded = await getPanel(instance);
    assert.equal(await instance.evaluate(({ app }) => app.getName()), 'Submundo Compras');
    assert.equal(await instance.evaluate(({ app }) => app.getPath('userData')), legacyUserData);
    await branded.waitForFunction(() => document.querySelector('#vault-state').textContent === 'Cofre bloqueado');
    assert.equal(await branded.locator('#vault-password').getAttribute('maxlength'), null);
    await branded.locator('#vault-password').fill('senha-legada-ficticia');
    await branded.locator('#vault-unlock').click();
    await branded.waitForFunction(() => document.querySelector('#vault-panel').hidden);
    await branded.locator('#pin-migration').waitFor();
    await branded.locator('#new-pin').fill('0042');
    await branded.locator('#confirm-pin').fill('0042');
    await branded.locator('#pin-save').click();
    await branded.waitForFunction(() => document.querySelector('#pin-migration').hidden && !document.querySelector('#pin-save').disabled);
    assert.equal(await branded.locator('#new-pin').inputValue(), '');
    await branded.locator('#vault-lock').click();
    await branded.waitForFunction(() => !document.querySelector('#vault-panel').hidden);
    assert.equal(await branded.locator('#vault-password').getAttribute('maxlength'), '4');
    await branded.locator('#vault-password').fill('0043');
    await branded.locator('#vault-unlock').click();
    await branded.waitForFunction(() => document.querySelector('#message').textContent.includes('PIN incorreto'));
    await branded.locator('#vault-password').fill('0042');
    await branded.locator('#vault-unlock').click();
    await branded.waitForFunction(() => document.querySelector('#vault-panel').hidden);
    await branded.locator('.sidebar [data-view=buy]').click();
    await branded.locator('#card-profile').selectOption({ label: 'Principal · final 1111' });
    assert.match(await branded.locator('#buy-balance').textContent(), /876,55/);
    console.log('PASS: Electron real: abrir evento nos 16 perfis com cofre bloqueado, link validado, cookies isolados, seleção/carrinhos preservados, repetição sem duplicar e Enter sem preencher; leitura de evento, lotes, quantidade, valores e total; estoque apenas após pagamento registrado; rateio exato, preço de revenda e CSV sem cartão/CPF; edição de lote preserva limite; rascunhos isolados por janela e persistência criptografada após reiniciar; contador automático por janela com cofre bloqueado, atualização, urgência, expiração, ausência, navegação, exclusão de provedor externo, seleção e fechamento; layout com navegação; 16 perfis; sessões isoladas; destino correto; 16 campos + seguro sem pagar; CPF com horário; CVV opcional criptografado; limite sem débito ao preencher, confirmação única, correção, pendências após reiniciar e remoção do CVV; identidade Submundo preserva o diretório e o cofre anteriores; PIN com zero à esquerda e migração da senha antiga sem perda de dados.');
  } catch (error) {
    const panel = instance?.windows().find(page => page.url() === 'app://manager/popup.html');
    if (panel) { await panel.screenshot({ path: path.join(root, 'test-results/desktop-error.png'), fullPage: true }).catch(() => {}); console.error('UI:', await panel.locator('#message').textContent().catch(() => '')); }
    throw error;
  } finally {
    await instance?.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  if (process.env.GITHUB_ACTIONS === 'true') {
    // This runner uses only synthetic data. Surface its failure location in the
    // Actions annotation as well as the log so diagnostics remain reviewable.
    const detail = String(error.stack || error).slice(0, 6000).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.error(`::error title=Teste Electron::${detail}`);
  }
  process.exitCode = 1;
});
