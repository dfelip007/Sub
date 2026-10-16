(() => {
  'use strict';
  const bridge = globalThis.desktopBridge;
  const $ = id => document.getElementById(id);
  const storageArea = area => ({ get: key => bridge.read(area, key), set: values => bridge.write(area, values), remove: key => bridge.remove(area, key), async setAccessLevel() {} });
  const wallet = new CheckoutWallet.Wallet({ local: storageArea('local'), session: storageArea('session') });
  const { money, inputMoney, cents } = CheckoutWallet;
  const titles = {
    buy: ['Uma compra de cada vez.', 'Escolha o perfil, o comprador e o cartão. O resto fica mais rápido.'],
    buyers: ['Seus compradores.', 'Cadastre uma vez. Escolha a pessoa certa em cada compra.'],
    cards: ['Seus cartões, organizados.', 'Veja o disponível e acompanhe as compras registradas.'],
    browsers: ['Cada login no seu lugar.', 'Vários perfis de navegação, sem instalar extensões.'],
    history: ['Tudo o que foi registrado.', 'Confirme pagamentos e acompanhe o limite de cada cartão.'],
    settings: ['Do seu jeito.', 'Contato fixo, importação e configurações do cofre.']
  };
  const dateTime = value => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const runtime = crypto.randomUUID();
  let state, exists = false, busy = false, timer, currentView = 'buy', usageVersion = 0, activeOrderId = '';
  let contact = { email: '', phone: '' };
  let usages = new Map();
  function message(text, kind = 'success') { $('message').textContent = text; $('message').dataset.kind = kind; $('message').hidden = !text; }
  function node(tag, text, className = '') { const result = document.createElement(tag); result.textContent = text; if (className) result.className = className; return result; }
  function button(text, action, id, className = 'secondary') { const result = node('button', text, className); result.type = 'button'; result.dataset[action] = id; return result; }
  function empty(target, title, detail = '') { const result = node('div', '', 'empty'); result.append(node('strong', title)); if (detail) result.append(node('span', detail)); target.append(result); }
  function options(select, entries, value = select.value) {
    const signature = JSON.stringify(entries);
    if (select.dataset.options !== signature) { select.replaceChildren(...entries.map(([label, id]) => new Option(label, String(id)))); select.dataset.options = signature; }
    select.value = value == null ? '' : String(value);
  }
  function navigate(view) {
    if (!titles[view]) return;
    currentView = view;
    for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== `view-${view}`;
    for (const control of document.querySelectorAll('.sidebar [data-view]')) { if (control.dataset.view === view) control.setAttribute('aria-current', 'page'); else control.removeAttribute('aria-current'); }
    [$('page-title').textContent, $('page-subtitle').textContent] = titles[view];
    window.scrollTo({ top: 0 });
  }
  function controls() {
    for (const control of document.querySelectorAll('button')) control.disabled = busy;
    for (const control of document.querySelectorAll('#buyer-form button,#card-form button,[data-new],#import')) control.disabled = busy || !wallet.unlocked;
    $('purchase-fields').disabled = busy || !wallet.unlocked;
    $('buyer-profile').disabled = $('card-profile').disabled = busy || !wallet.unlocked;
    $('desktop-profile').disabled = busy || !state;
    $('desktop-target').disabled = busy || !state?.tab;
    $('desktop-used').disabled = busy || !selectedBuyer();
  }
  async function run(action, success = '') {
    if (busy) return;
    busy = true; controls();
    try { await action(); if (success) message(success); }
    catch (error) { message(String(error.message || 'Não foi possível concluir.').replace(/^Error invoking remote method '[^']+': Error: /, ''), 'error'); }
    finally { busy = false; render(); }
  }
  function normalizeForm(form) {
    if (form.elements.birthDate) form.elements.birthDate.value = CheckoutDates.birth(form.elements.birthDate.value);
    if (form.elements.cardExpiry) form.elements.cardExpiry.value = CheckoutDates.expiry(form.elements.cardExpiry.value);
  }
  function selectedBuyer() { return wallet.unlocked ? wallet.list('buyers').find(item => item.id === $('buyer-profile').value) : null; }
  function selectedCard() { return wallet.unlocked ? wallet.cards().find(item => item.id === $('card-profile').value) : null; }
  function renderVault() {
    clearTimeout(timer);
    const unlocked = wallet.unlocked;
    $('vault-state').textContent = unlocked ? '● Cofre desbloqueado' : exists ? 'Cofre bloqueado' : 'Crie seu cofre';
    $('vault-state').classList.toggle('locked', !unlocked);
    $('vault-panel').hidden = unlocked;
    $('vault-lock').hidden = !unlocked;
    $('vault-reset').hidden = !exists;
    $('vault-title').textContent = exists ? 'Bem-vindo de volta.' : 'Tudo começa pelo seu cofre.';
    $('vault-description').textContent = exists ? 'Desbloqueie para acessar compradores, cartões e histórico.' : 'Crie uma senha para guardar seus cadastros com criptografia.';
    $('vault-confirm-label').hidden = exists;
    $('vault-confirm').required = !exists;
    $('vault-password').minLength = exists ? 1 : 10;
    $('vault-unlock').textContent = exists ? 'Desbloquear cofre' : 'Criar cofre e começar';
    if (unlocked) timer = setTimeout(expire, Math.max(0, wallet.expiresAt - Date.now()));
  }
  function renderBrowser() {
    if (!state) return;
    options($('desktop-profile'), state.profiles.map(item => [item.label, item.id]), state.profileId);
    const tabs = state.tabs.filter(item => item.profileId === state.profileId);
    options($('desktop-target'), tabs.length ? tabs.map((item, index) => [`Janela ${index + 1} · ${new URL(item.url).hostname || 'abrindo…'}`, item.id]) : [['Abra a Meaple neste perfil', '']], state.tab?.id);
    $('desktop-count').textContent = `${state.profiles.length} salvos · ${state.tabs.length} janelas abertas`;
    $('selected-browser-label').textContent = state.profiles.find(item => item.id === state.profileId)?.label || '';
    $('desktop-state').textContent = state.error || (state.loading ? 'Carregando a Meaple…' : state.tab ? 'Somente a janela selecionada acima receberá os dados.' : 'Clique em Abrir / ver Meaple para começar neste perfil.');
    const list = $('browsers-list'); list.replaceChildren();
    for (const profile of state.profiles) {
      const row = node('div', '', 'record-row'); const main = node('div', '', 'record-main');
      main.append(node('strong', profile.label), node('p', `${state.tabs.filter(tab => tab.profileId === profile.id).length} janelas abertas${profile.id === state.profileId ? ' · Selecionado' : ''}`));
      row.append(node('div', '▦', 'avatar'), main, button('Usar este perfil ↗', 'useProfile', profile.id)); list.append(row);
    }
  }
  function renderProfiles() {
    const buyers = wallet.unlocked ? wallet.list('buyers') : [];
    const cards = wallet.unlocked ? wallet.cards() : [];
    options($('buyer-profile'), [['Selecione um comprador', ''], ...buyers.map(item => [item.label + (usages.get(item.values.cpf.replace(/\D/g, ''))?.status === 'used' ? ' · JÁ UTILIZADO' : ''), item.id])]);
    options($('card-profile'), [['Selecione um cartão', ''], ...cards.map(item => [`${item.label} · final ${item.values.cardNumber.replace(/\D/g, '').slice(-4)}`, item.id])]);
    const buyerList = $('buyers-list'); buyerList.replaceChildren();
    const query = $('buyer-search').value.trim().toLocaleLowerCase('pt-BR');
    for (const buyer of buyers.filter(item => `${item.label} ${item.values.buyerName} ${item.values.cpf} ${item.values.cpf.replace(/\D/g, '')}`.toLocaleLowerCase('pt-BR').includes(query))) {
      const row = node('div', '', 'record-row'); const main = node('div', '', 'record-main');
      const usage = usages.get(buyer.values.cpf.replace(/\D/g, ''));
      main.append(node('strong', buyer.label), node('p', `${buyer.values.buyerName} · CPF final ${buyer.values.cpf.replace(/\D/g, '').slice(-4)}`));
      if (usage?.status === 'used') main.append(node('span', `Já utilizado · ${dateTime(usage.at)}`, 'tag used'));
      row.append(node('div', buyer.label.slice(0, 2).toUpperCase(), 'avatar'), main, button('Editar', 'editBuyer', buyer.id)); buyerList.append(row);
    }
    if (!buyerList.children.length) empty(buyerList, wallet.unlocked ? query ? 'Nenhum comprador encontrado.' : 'Quem vai comprar?' : 'Seus compradores ficam no cofre.', 'Use Novo comprador para cadastrar nome, CPF e nascimento.');
    const cardList = $('cards-list'); cardList.replaceChildren();
    for (const card of cards) {
      const summary = wallet.summary(card.id); const tile = node('article', '', 'card-tile'); const top = node('div', '', 'card-top'); const heading = node('div', '', 'section-heading');
      heading.append(node('h2', card.label), node('small', card.values.cardExpiry));
      top.append(heading, node('p', `••••  ••••  ••••  ${card.values.cardNumber.replace(/\D/g, '').slice(-4)}`, 'card-digits'));
      const body = node('div', '', 'card-body'); body.append(node('p', 'DISPONÍVEL NO CONTROLE'), node('strong', money(summary.available), summary.available < 0 ? 'negative' : ''), node('p', `${money(summary.used)} em compras pagas registradas`));
      const actions = node('div', '', 'actions'); actions.append(node('span', card.values.cardCvv ? 'CVV salvo no cofre' : 'CVV informado na compra', 'hint'), button('Editar cartão', 'editCard', card.id, 'text-button'));
      body.append(actions); tile.append(top, body); cardList.append(tile);
    }
    if (!cards.length) empty(cardList, wallet.unlocked ? 'Seu primeiro cartão, pronto para usar.' : 'Seus cartões ficam no cofre.', 'Cadastre o cartão e informe o limite disponível.');
    renderSelection();
  }
  function renderSelection(loadCvv = false) {
    const buyer = selectedBuyer(), card = selectedCard();
    const usage = buyer && usages.get(buyer.values.cpf.replace(/\D/g, ''));
    $('desktop-used').checked = usage?.status === 'used';
    $('desktop-usage-state').textContent = !buyer ? 'Selecione um comprador para consultar a última utilização.' : usage?.status === 'used' ? `Utilizado pela última vez em: ${dateTime(usage.at)}` : 'Este CPF ainda não foi marcado como utilizado.';
    if (loadCvv) $('purchase-cvv').value = card?.values.cardCvv || '';
    $('cvv-help').textContent = card?.values.cardCvv ? 'CVV salvo no cofre. Pode alterar nesta compra.' : 'Informe o código de segurança.';
    const summary = card ? wallet.summary(card.id) : { available: null };
    $('buy-balance').textContent = card ? money(summary.available) : '—';
    $('buy-balance').classList.toggle('negative', summary.available < 0);
    $('buy-projection').classList.remove('negative');
    $('buy-projection').textContent = !card ? 'Selecione um cartão cadastrado.' : summary.available == null ? 'Informe o disponível no cadastro do cartão.' : 'Atualizado após registrar um pagamento.';
    if (card && summary.available != null && $('purchase-amount').value.trim()) {
      try { const remaining = summary.available - cents($('purchase-amount').value); $('buy-projection').textContent = `Após esta compra: ${money(remaining)}`; $('buy-projection').classList.toggle('negative', remaining < 0); } catch { $('buy-projection').textContent = 'Confira o formato do valor.'; }
    }
    $('contact-reminder').hidden = Boolean(contact.email && contact.phone);
  }
  function renderOrders() {
    const orders = wallet.unlocked ? wallet.orders() : [];
    const pending = $('pending-orders'), history = $('history-list'); pending.replaceChildren(); history.replaceChildren();
    const statusNames = { pending: 'Aguardando confirmação', confirmed: 'Compra paga', reversed: 'Registro desfeito', canceled: 'Registro cancelado' };
    function row(order) {
      const result = node('div', '', 'record-row'); const main = node('div', '', 'record-main');
      main.append(node('strong', `${money(order.amountCents)} · ${order.cardLabel} · final ${order.cardLast4}`), node('p', `${order.buyer} · ${order.profile} · ${dateTime(order.confirmedAt || order.createdAt)}`), node('span', statusNames[order.status], `tag ${order.status}`));
      if (order.reference) main.append(node('p', `Pedido: ${order.reference}`));
      const actions = node('div', '', 'actions');
      if (order.status === 'pending') actions.append(button('Registrar pagamento', 'confirmOrder', order.id), button('Cancelar registro', 'cancelOrder', order.id, 'quiet'));
      if (order.status === 'confirmed') actions.append(button('Desfazer registro', 'reverseOrder', order.id, 'quiet'));
      result.append(main, actions); return result;
    }
    for (const order of orders) {
      if (order.status === 'pending') pending.append(row(order));
      if ($('history-filter').value === 'all' || $('history-filter').value === order.status) history.append(row(order));
    }
    if (!pending.children.length) empty(pending, 'Nenhum pagamento aguardando registro.', 'Ao preencher um checkout, ele aparecerá aqui.');
    if (!history.children.length) empty(history, 'Seu histórico começa na próxima compra.', 'Os registros ficam salvos no cofre e podem ser consultados depois.');
  }
  function render() { renderVault(); renderBrowser(); renderProfiles(); renderOrders(); controls(); }
  async function refreshUsage() {
    const version = ++usageVersion;
    const buyers = wallet.unlocked ? wallet.list('buyers') : [];
    try {
      const results = await bridge.usage(buyers.map(item => item.values.cpf));
      if (version !== usageVersion || !wallet.unlocked) return;
      usages = new Map(buyers.map((item, index) => [item.values.cpf.replace(/\D/g, ''), results[index]]));
      renderProfiles(); controls();
    } catch { if (wallet.unlocked) $('desktop-usage-state').textContent = 'Não foi possível consultar a última utilização. Confira antes de preencher.'; }
  }
  async function lock() {
    await wallet.lock(); usages.clear(); usageVersion++;
    for (const id of ['buyer-form', 'card-form', 'checkout', 'vault-form']) $(id).reset();
    for (const id of ['buyer-editor', 'card-editor']) $(id).hidden = true;
    $('import-data').value = ''; $('buyer-search').value = '';
    if ($('order-dialog').open) $('order-dialog').close();
    $('order-form').reset(); activeOrderId = '';
  }
  async function expire() {
    await lock(); render(); message('Cofre bloqueado. Desbloqueie para continuar.');
  }
  function editor(kind, id = '') {
    if (!wallet.unlocked) { message('Desbloqueie o cofre para editar cadastros.', 'error'); return; }
    navigate(kind === 'buyer' ? 'buyers' : 'cards');
    const form = $(`${kind}-form`); form.reset(); $(`${kind}-id`).value = id;
    const record = id ? wallet.list(kind === 'buyer' ? 'buyers' : 'cards').find(item => item.id === id) : null;
    if (id && !record) return;
    $(`${kind}-label`).value = record?.label || '';
    $(`${kind}-editor-title`).textContent = id ? `Editar ${kind === 'buyer' ? 'comprador' : 'cartão'}` : `Novo ${kind === 'buyer' ? 'comprador' : 'cartão'}`;
    $(`${kind}-delete`).hidden = !id;
    const fields = kind === 'buyer' ? CheckoutVault.buyerFields : CheckoutVault.cardFields;
    for (const field of fields) form.elements[field].value = record?.values[field] || (field === 'country' ? 'Brasil' : '');
    if (kind === 'card') {
      form.elements.savedCvv.value = record?.values.cardCvv || '';
      $('card-save-cvv').checked = Boolean(record?.values.cardCvv);
      $('card-available').value = record ? inputMoney(wallet.summary(id).available) : '';
      $('card-limit-help').textContent = id ? 'Ao alterar o disponível, você ajusta o saldo atual. O histórico de compras é mantido.' : 'Compras pagas registradas no programa serão descontadas automaticamente do disponível.';
    }
    $(`${kind}-editor`).hidden = false;
    $(`${kind}-editor`).scrollIntoView({ block: 'start', behavior: 'instant' }); $(`${kind}-label`).focus();
  }
  function openOrder(id) {
    if (!wallet.unlocked) return;
    const order = wallet.orders().find(item => item.id === id && item.status === 'pending');
    if (!order) return;
    activeOrderId = id; $('order-description').textContent = `${order.buyer} · ${order.cardLabel} · final ${order.cardLast4}`;
    $('order-amount').value = inputMoney(order.amountCents); $('order-reference').value = order.reference || ''; $('order-error').textContent = '';
    projectOrder(); $('order-dialog').showModal(); $('order-amount').focus();
  }
  function projectOrder() {
    const order = wallet.unlocked && wallet.orders().find(item => item.id === activeOrderId);
    if (!order) return;
    const summary = wallet.summary(order.cardId);
    try { const after = summary.available == null ? null : summary.available - cents($('order-amount').value); $('order-projection').textContent = after == null ? 'Limite não informado. Você pode cadastrá-lo na tela Cartões.' : `Disponível após registrar: ${money(after)}`; $('order-projection').classList.toggle('negative', after < 0); }
    catch { $('order-projection').textContent = `Disponível agora: ${money(summary.available)}`; }
  }
  document.addEventListener('click', event => {
    const control = event.target.closest('button'); if (!control || control.disabled) return;
    if (control.dataset.view) navigate(control.dataset.view);
    if (control.dataset.new) editor(control.dataset.new);
    if (control.dataset.close) $(control.dataset.close).hidden = true;
    if (control.dataset.editBuyer) editor('buyer', control.dataset.editBuyer);
    if (control.dataset.editCard) editor('card', control.dataset.editCard);
    if (control.dataset.useProfile) void run(async () => { state = await bridge.selectBrowser(control.dataset.useProfile); state = await bridge.open(); navigate('buy'); });
    if (control.dataset.confirmOrder) openOrder(control.dataset.confirmOrder);
    if (control.dataset.cancelOrder && globalThis.confirm('Cancelar este registro pendente? Nenhum valor será descontado do limite.')) void run(() => wallet.finishOrder(control.dataset.cancelOrder, 'canceled'), 'Registro pendente cancelado.');
    if (control.dataset.reverseOrder && globalThis.confirm('Desfazer este registro no programa e devolver o valor ao disponível? Isso não cancela nem estorna o pagamento no banco.')) void run(() => wallet.finishOrder(control.dataset.reverseOrder, 'reversed'), 'Registro desfeito. O valor voltou ao disponível no programa.');
  });
  $('vault-form').addEventListener('submit', event => {
    event.preventDefault(); void run(async () => {
      try {
        if (!exists && $('vault-password').value !== $('vault-confirm').value) throw new Error('As senhas precisam ser iguais.');
        if (exists) await wallet.unlock($('vault-password').value); else await wallet.create($('vault-password').value);
        exists = true; await refreshUsage();
      } finally { $('vault-password').value = $('vault-confirm').value = ''; }
    }, 'Cofre desbloqueado. Seus cadastros estão prontos.');
  });
  $('vault-lock').addEventListener('click', () => { void run(lock, 'Cofre bloqueado. Seus dados continuam salvos.'); });
  $('vault-reset').addEventListener('click', () => {
    if (!globalThis.confirm('Apagar todos os compradores, cartões, CVVs salvos e o histórico financeiro? Não é possível desfazer. O contato, os perfis de navegação e as marcações de CPF serão mantidos.')) return;
    void run(async () => { await wallet.reset(); await lock(); exists = false; }, 'Cofre apagado. Crie uma nova senha para recomeçar.');
  });
  $('buyer-form').addEventListener('submit', event => {
    event.preventDefault(); void run(async () => {
      const form = $('buyer-form'); normalizeForm(form);
      const values = Object.fromEntries(CheckoutVault.buyerFields.map(field => [field, form.elements[field].value.trim()]));
      if (!values.buyerName || !/^\d{11}$/.test(values.cpf.replace(/\D/g, '')) || !CheckoutDates.validBirth(values.birthDate)) throw new Error('Confira nome, CPF e data de nascimento.');
      const id = await wallet.save('buyers', $('buyer-id').value, $('buyer-label').value, values);
      $('buyer-editor').hidden = true; renderProfiles(); $('buyer-profile').value = id; await refreshUsage();
    }, 'Comprador salvo. Ele já pode ser selecionado na tela Comprar.');
  });
  $('card-form').addEventListener('submit', event => {
    event.preventDefault(); void run(async () => {
      const form = $('card-form'); normalizeForm(form);
      const values = Object.fromEntries(CheckoutVault.cardFields.map(field => [field, form.elements[field].value.trim()]));
      values.cardCvv = form.elements.savedCvv.value;
      const id = await wallet.saveCard($('card-id').value, $('card-label').value, values, { saveCvv: $('card-save-cvv').checked, available: $('card-available').value });
      form.reset(); $('card-editor').hidden = true; renderProfiles(); $('card-profile').value = id; renderSelection(true);
    }, 'Cartão salvo. O disponível já está atualizado.');
  });
  for (const kind of ['buyer', 'card']) $(`${kind}-delete`).addEventListener('click', () => {
    if (!globalThis.confirm(`Excluir este ${kind === 'buyer' ? 'comprador' : 'cartão'}?`)) return;
    void run(async () => { await wallet.remove(kind === 'buyer' ? 'buyers' : 'cards', $(`${kind}-id`).value); $(`${kind}-editor`).hidden = true; $(`${kind}-form`).reset(); await refreshUsage(); }, 'Cadastro excluído.');
  });
  $('contact-form').addEventListener('submit', event => {
    event.preventDefault(); void run(async () => { const form = $('contact-form'); const next = { email: form.elements.email.value.trim(), phone: form.elements.phone.value.trim() }; await bridge.write('local', { contact: next }); contact = next; }, 'Contato fixo salvo para as próximas compras.');
  });
  $('forget-contact').addEventListener('click', () => { void run(async () => { await bridge.remove('local', 'contact'); contact = { email: '', phone: '' }; $('contact-form').reset(); }, 'Contato fixo removido.'); });
  $('import').addEventListener('click', () => {
    if (!wallet.unlocked) return;
    const { values } = CheckoutImport.parse($('import-data').value); $('import-data').value = '';
    editor('buyer'); for (const field of CheckoutVault.buyerFields) $('buyer-form').elements[field].value = values[field] || ''; normalizeForm($('buyer-form'));
    if (values.cardNumber) { editor('card'); for (const field of CheckoutVault.cardFields) $('card-form').elements[field].value = values[field] || (field === 'country' ? 'Brasil' : ''); $('card-form').elements.savedCvv.value = values.cardCvv || ''; normalizeForm($('card-form')); }
    message('Dados preparados. Revise e salve o comprador e o cartão nas respectivas telas.');
  });
  $('buyer-search').addEventListener('input', renderProfiles);
  $('buyer-profile').addEventListener('change', () => { renderSelection(); controls(); });
  $('card-profile').addEventListener('change', () => renderSelection(true));
  $('purchase-amount').addEventListener('input', () => renderSelection());
  $('history-filter').addEventListener('change', renderOrders);
  $('desktop-profile').addEventListener('change', () => { void run(async () => { state = await bridge.selectBrowser($('desktop-profile').value); }); });
  $('desktop-target').addEventListener('change', () => { void run(async () => { state = await bridge.selectTab(Number($('desktop-target').value)); }); });
  $('desktop-open').addEventListener('click', () => { void run(async () => { state = await bridge.open(); }); });
  $('desktop-new-window').addEventListener('click', () => { void run(async () => { state = await bridge.open(true); navigate('buy'); }); });
  $('browser-form').addEventListener('submit', event => { event.preventDefault(); void run(async () => { state = await bridge.createBrowser($('desktop-label').value, Number($('desktop-quantity').value)); }, 'Perfis criados. Use um perfil da lista para abrir a Meaple.'); });
  $('desktop-rename').addEventListener('click', () => { void run(async () => { state = await bridge.renameBrowser(state.profileId, $('browser-rename-label').value); $('browser-rename-label').value = ''; }, 'Perfil renomeado.'); });
  $('desktop-delete').addEventListener('click', () => {
    if (!globalThis.confirm('Excluir o perfil selecionado e seus cookies? Suas janelas serão fechadas. O histórico de compras e CPF será mantido.')) return;
    void run(async () => { state = await bridge.removeBrowser(state.profileId); }, 'Perfil removido.');
  });
  $('desktop-used').addEventListener('change', () => {
    const buyer = selectedBuyer(); if (!buyer) return;
    const marking = $('desktop-used').checked;
    if (!marking && !globalThis.confirm('Remover a marcação de utilizado deste CPF?')) { renderSelection(); return; }
    void run(async () => { if (marking) await bridge.markUsed(buyer.values.cpf); else await bridge.release(buyer.values.cpf, usages.get(buyer.values.cpf.replace(/\D/g, ''))); await refreshUsage(); });
  });
  $('checkout').addEventListener('submit', event => {
    event.preventDefault(); void run(async () => {
      const buyer = selectedBuyer(), card = selectedCard();
      if (!buyer || !card) throw new Error('Selecione um comprador e um cartão cadastrados.');
      if (!contact.email || !contact.phone) { navigate('settings'); throw new Error('Salve o e-mail e o telefone do contato fixo antes de preencher.'); }
      const cvv = $('purchase-cvv').value.trim() || card.values.cardCvv || '';
      if (!/^\d{3,4}$/.test(cvv)) { $('purchase-cvv').focus(); throw new Error('Informe um CVV com 3 ou 4 dígitos.'); }
      if (!CheckoutDates.validBirth(buyer.values.birthDate) || !CheckoutDates.validExpiry(card.values.cardExpiry)) throw new Error('Confira nascimento e validade nos cadastros.');
      const destination = await bridge.checkout();
      if (!destination.tab) throw new Error('Abra a Meaple no perfil e escolha a janela de destino.');
      const profile = destination.profiles.find(item => item.id === destination.profileId);
      const orderId = await wallet.stageOrder({ scope: `${runtime}:${destination.tab.id}`, cardId: card.id, buyer: buyer.label, buyerId: buyer.id, profile: profile.label, amount: $('purchase-amount').value });
      const data = Object.fromEntries([...CheckoutVault.buyerFields.map(field => [field, buyer.values[field]]), ...CheckoutVault.cardFields.map(field => [field, card.values[field] || '']), ['email', contact.email], ['phone', contact.phone], ['cardCvv', cvv], ['installments', $('purchase-installments').value]]);
      $('status').textContent = 'Preenchendo o checkout…'; $('status').dataset.kind = ''; $('details').replaceChildren();
      try {
        await bridge.prepare(destination.tab.id);
        const result = await bridge.fill(destination.tab.id, data);
        $('status').textContent = `${result.filled.length} itens preenchidos. ${result.pending.length ? 'Confira as pendências abaixo.' : 'Revise e finalize na Meaple.'}`;
        for (const item of result.pending) $('details').append(node('li', item));
        message('Checkout preenchido. Após pagar na Meaple, use Registrar pagamento para atualizar o limite.');
      } catch {
        $('status').textContent = 'Não foi possível concluir o preenchimento. Abra o checkout da Meaple e tente novamente.'; $('status').dataset.kind = 'error';
        message('O registro ficou pendente no histórico. Confira o carrinho; nenhum valor foi descontado do limite.', 'error');
      } finally {
        for (const key of Object.keys(data)) data[key] = '';
        $('purchase-cvv').value = ''; await refreshUsage();
      }
      // The encrypted pending record survives a restart; no debit happens here.
      if (!orderId) throw new Error('Não foi possível criar o registro da compra.');
    });
  });
  $('order-close').addEventListener('click', () => $('order-dialog').close());
  $('order-dialog').addEventListener('close', () => { $('order-form').reset(); activeOrderId = ''; });
  $('order-amount').addEventListener('input', projectOrder);
  $('order-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !activeOrderId) return;
    busy = true; controls();
    try { await wallet.confirmOrder(activeOrderId, $('order-amount').value, $('order-reference').value); $('order-dialog').close(); message('Compra paga registrada. O valor foi descontado do limite do cartão.'); }
    catch (error) { $('order-error').textContent = error.message; }
    finally { busy = false; render(); }
  });
  CheckoutDates.bind($('buyer-form').elements.birthDate, 'birth'); CheckoutDates.bind($('card-form').elements.cardExpiry, 'expiry');
  bridge.onState(next => { state = next; renderBrowser(); controls(); });
  bridge.onUsage(() => { void refreshUsage(); });
  bridge.onExpired(() => { void expire(); });
  void (async () => {
    try {
      const saved = await bridge.read('local', 'contact'); contact = saved.contact || contact;
      for (const field of ['email', 'phone']) $('contact-form').elements[field].value = contact[field];
      state = await bridge.checkout(); await wallet.restore(); exists = Boolean(wallet.envelope); await refreshUsage(); render();
    } catch { message('Não foi possível carregar seus dados. Os arquivos foram preservados. Reinicie o programa.', 'error'); controls(); }
  })();
})();
