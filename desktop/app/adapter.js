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
    tickets: ['Ingressos prontos para organizar.', 'Lotes, custos e preço desejado para revenda em um só lugar.'],
    news: ['Fique por dentro da Submundo.', 'Acompanhe os perfis oficiais e confira os conteúdos encontrados.'],
    settings: ['Do seu jeito.', 'Contato fixo, importação e configurações do cofre.']
  };
  const dateTime = value => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const runtime = crypto.randomUUID();
  let state, exists = false, busy = false, timer, currentView = 'buy', usageVersion = 0, activeOrderId = '';
  let contact = { email: '', phone: '' };
  let usages = new Map();
  let draftKey = '', ticketRequest = 0, ticketDirty = false, amountDirty = false, requestedKey = '', editTicketOrder = '';
  const ticketDrafts = new Map();
  const resaleDrafts = new Map();
  let newsState, newsPending = false, newsCooldown;
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
    $('vault-panel').hidden = wallet.unlocked || view === 'news';
    window.scrollTo({ top: 0 });
  }
  function controls() {
    const working = busy || Boolean(state?.launch?.running);
    for (const control of document.querySelectorAll('button')) control.disabled = working;
    for (const control of document.querySelectorAll('#buyer-form button,#card-form button,[data-new],#import')) control.disabled = working || !wallet.unlocked;
    $('purchase-fields').disabled = working || !wallet.unlocked;
    $('pin-fields').disabled = working || !wallet.unlocked;
    $('ticket-edit-fields').disabled = working || !wallet.unlocked;
    $('tickets-export').disabled = working || !wallet.unlocked;
    for (const control of document.querySelectorAll('#tickets-stock input,#tickets-stock button')) control.disabled = working || !wallet.unlocked;
    $('buyer-profile').disabled = $('card-profile').disabled = working || !wallet.unlocked;
    $('desktop-profile').disabled = working || !state;
    $('desktop-target').disabled = working || !state?.tab;
    $('desktop-used').disabled = working || !selectedBuyer();
    for (const input of document.querySelectorAll('[data-event-link]')) input.disabled = working;
    for (const control of document.querySelectorAll('[data-open-all]')) control.disabled = working || !state?.profiles.length;
    newsControls();
  }
  function newsControls() {
    const working = busy || Boolean(state?.launch?.running);
    const pending = newsPending || newsState?.busy;
    $('news-enabled').disabled = working || !newsState || Boolean(newsState.error) || newsPending && !newsState.enabled;
    $('news-check').disabled = working || pending || !newsState || Boolean(newsState.error) || Date.now() < (newsState.nextCheckAt || 0);
    $('news-check').textContent = newsState?.busy ? 'Verificando…' : 'Verificar agora';
    $('news-read').disabled = working || pending || !newsState || Boolean(newsState.error);
    for (const control of document.querySelectorAll('[data-news-open]')) control.disabled = working;
  }
  async function newsAction(action, concurrent = false) {
    if (newsPending && !concurrent) return;
    if (!concurrent) newsPending = true;
    newsControls(); $('news-message').hidden = true;
    try { newsState = await action(); renderNews(); }
    catch (error) { $('news-message').textContent = String(error.message || 'Não foi possível consultar as novidades.').replace(/^Error invoking remote method '[^']+': Error: /, ''); $('news-message').hidden = false; }
    finally { if (!concurrent) newsPending = false; newsControls(); }
  }
  function renderNews() {
    if (!newsState) return;
    const unread = newsState.profiles.reduce((sum, profile) => sum + profile.unread, 0);
    $('news-badge').textContent = unread; $('news-badge').hidden = !unread;
    $('news-shortcut').textContent = `Novidades · ${unread}`; $('news-shortcut').classList.toggle('has-news', unread > 0);
    $('news-shortcut').setAttribute('aria-label', `Novidades da Submundo: ${unread} itens não lidos`);
    $('news-enabled').checked = newsState.enabled;
    $('news-mode').textContent = newsState.busy ? 'Verificando os perfis…' : newsState.enabled ? 'Automático · a cada 5 min' : 'Acompanhamento pausado';
    if (newsState.error) { $('news-message').textContent = newsState.error; $('news-message').hidden = false; }
    const list = $('news-profiles'); list.replaceChildren();
    const status = { idle: 'Ainda não verificado.', ok: 'Leitura concluída. Confira abaixo o que foi identificado.', login: 'O Instagram pediu login. Abra o perfil para entrar e depois verifique novamente.', unavailable: 'Não foi possível confirmar novidades nesta leitura. Abra o perfil para conferir.', outside: 'O Instagram redirecionou o acesso. Abra o perfil para conferir.' };
    const types = { post: 'Publicação', reel: 'Reel', story: 'Story' };
    for (const profile of newsState.profiles) {
      const card = node('article', '', 'surface news-profile'); card.dataset.newsProfile = profile.username;
      const heading = node('div', '', 'section-heading'); heading.append(node('h2', `@${profile.username}`), node('span', `${profile.unread} não lidos`, profile.unread ? 'tag used' : 'tag'));
      const actions = node('div', '', 'actions');
      for (const [title, kind] of [['Abrir perfil / entrar', 'profile'], ['Ver stories', 'stories']]) { const control = button(title, 'newsOpen', profile.username, 'secondary'); control.dataset.newsKind = kind; actions.append(control); }
      card.append(heading, actions, node('p', status[profile.status] || status.unavailable, `news-status ${profile.status === 'ok' ? '' : 'uncertain'}`), node('p', profile.lastSuccess ? `Última leitura confirmada: ${dateTime(profile.lastSuccess)}` : 'Sem leitura confirmada ainda.', 'hint'));
      if (profile.lastAttempt && profile.lastAttempt !== profile.lastSuccess) card.append(node('p', `Última tentativa: ${dateTime(profile.lastAttempt)}. Os itens anteriores podem estar desatualizados.`, 'hint'));
      card.append(node('p', profile.story === 'identified' ? 'Story específico identificado na última leitura. Confira se ainda está disponível.' : 'Stories: sem confirmação automática nesta leitura. Use Ver stories.', 'hint'));
      const feed = node('div', '', 'news-feed');
      for (const item of profile.items.slice(0, 12)) {
        const row = node('div', '', 'news-item'); row.dataset.newsKey = item.key;
        const readLabel = item.kind === 'post' ? item.seen ? 'lida' : 'não lida' : item.seen ? 'lido' : 'não lido';
        const text = node('div'); text.append(node('strong', `${types[item.kind]} · ${readLabel}`), node('p', `Detectado em ${dateTime(item.detectedAt)}`, 'hint'));
        if (item.kind === 'story') text.append(node('p', 'O story pode ter expirado.', 'hint'));
        const control = button('Ver no Instagram ↗', 'newsOpen', profile.username, 'text-button'); control.dataset.newsKind = item.kind; control.dataset.newsKey = item.key;
        row.append(text, control); feed.append(row);
      }
      if (!profile.items.length) empty(feed, profile.initialized ? 'Nenhum conteúdo identificável na última leitura.' : 'Aguardando a primeira leitura.', 'Consulte o perfil no Instagram se a leitura não estiver disponível.');
      card.append(feed); list.append(card);
    }
    clearTimeout(newsCooldown);
    const remaining = (newsState.nextCheckAt || 0) - Date.now();
    if (remaining > 0) newsCooldown = setTimeout(newsControls, remaining + 50);
    newsControls();
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
    $('vault-state').textContent = unlocked ? '● Cofre desbloqueado · 30 min' : exists ? 'Cofre bloqueado' : 'Crie seu cofre';
    $('vault-state').classList.toggle('locked', !unlocked);
    $('vault-panel').hidden = unlocked || currentView === 'news';
    $('vault-lock').hidden = !unlocked;
    $('vault-reset').hidden = !exists;
    $('vault-title').textContent = exists ? 'Bem-vindo de volta.' : 'Tudo começa pelo seu cofre.';
    const usePin = !exists || wallet.pinConfigured;
    $('vault-description').textContent = !exists ? 'Crie um PIN de 4 números para acessar seus cadastros.' : usePin ? 'Informe seu PIN para acessar compradores, cartões e histórico.' : 'Use sua senha anterior uma vez e depois defina o PIN de 4 números.';
    $('vault-password-label').textContent = usePin ? 'PIN do cofre (4 números)' : 'Senha anterior do cofre';
    $('vault-access-help').textContent = usePin ? 'Use exatamente 4 números. Desbloqueado por até 30 minutos ou até fechar o programa.' : 'Seus dados serão mantidos. Após entrar com a senha anterior, defina o novo PIN em Contato e ajustes.';
    const secretInput = $('vault-password');
    secretInput.inputMode = usePin ? 'numeric' : 'text';
    if (usePin) { secretInput.maxLength = 4; secretInput.pattern = '[0-9]{4}'; }
    else { secretInput.removeAttribute('maxlength'); secretInput.removeAttribute('pattern'); }
    $('vault-confirm-label').hidden = exists;
    $('vault-confirm').required = !exists;
    $('vault-password').minLength = usePin ? 4 : 1;
    $('pin-migration').hidden = !unlocked || wallet.pinConfigured;
    $('pin-settings-help').textContent = !unlocked ? 'Desbloqueie o cofre para definir ou trocar o PIN.' : wallet.pinConfigured ? 'Seu PIN atual tem 4 números. Para trocar, informe o novo PIN abaixo.' : 'Sua senha anterior foi confirmada. Escolha agora o PIN de 4 números.';
    $('vault-unlock').textContent = exists ? 'Desbloquear cofre' : 'Criar cofre e começar';
    if (unlocked) timer = setTimeout(expire, Math.max(0, wallet.expiresAt - Date.now()));
  }
  function clockText(timer) {
    if (!timer) return '—';
    const hours = Math.floor(timer.seconds / 3600);
    return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(Math.floor(timer.seconds / 60) % 60).padStart(2, '0')}:${String(timer.seconds % 60).padStart(2, '0')}`;
  }
  function urgency(timer) { return !timer ? 'unknown' : timer.seconds === 0 ? 'expired' : timer.seconds <= 120 ? 'urgent' : 'normal'; }
  function queueLabel(status) {
    return ({ available: 'Disponível', waiting: 'Na sala de espera', released: 'Liberado para o evento', event: 'Página do evento', checkout: 'No checkout', loading: 'Carregando página…', error: 'Falha ao consultar a página', outside: 'Fora da Meaple' })[status] || 'Status não identificado';
  }
  function profileQueue(profileId) {
    const tabs = state.tabs.filter(tab => tab.profileId === profileId);
    if (!tabs.length) return { status: 'unknown', text: 'Sem janelas abertas' };
    if (tabs.length === 1) return { status: tabs[0].queue || 'unknown', text: queueLabel(tabs[0].queue) };
    const groups = new Map();
    for (const tab of tabs) groups.set(tab.queue || 'unknown', (groups.get(tab.queue || 'unknown') || 0) + 1);
    const names = { available: 'disponível', waiting: 'na sala de espera', released: 'com acesso ao evento', event: 'na página do evento', checkout: 'no checkout', loading: 'carregando', error: 'com falha de leitura', outside: 'fora da Meaple', unknown: 'sem status identificado' };
    return { status: groups.size === 1 ? [...groups.keys()][0] : 'mixed', text: [...groups].map(([status, count]) => `${count} ${status === 'available' ? count === 1 ? 'disponível' : 'disponíveis' : status === 'released' ? count === 1 ? 'liberada para o evento' : 'liberadas para o evento' : names[status] || names.unknown}`).join(' · ') };
  }
  function renderProfileQueues() {
    for (const row of document.querySelectorAll('[data-browser-profile]')) {
      const summary = profileQueue(row.dataset.browserProfile), badge = row.querySelector('.profile-queue');
      badge.textContent = summary.text; badge.dataset.queue = summary.status;
    }
  }
  function renderTimers() {
    const tab = state.tab, timer = tab?.timer;
    $('cart-clock').dataset.urgency = urgency(timer);
    $('cart-time').textContent = clockText(timer);
    $('cart-time-state').textContent = !tab ? 'Aguardando checkout' : !timer ? tab.loading ? 'Consultando o site…' : 'Tempo não identificado' : timer.seconds === 0 ? 'Contador esgotado' : timer.seconds <= 120 ? 'Atenção: 2 minutos ou menos' : 'Tempo restante para finalizar';
    $('cart-time-help').textContent = !tab ? 'Abra a Meaple neste perfil e avance ao checkout.' : !timer ? 'Ao entrar em /orders/, inicia a contagem local de 10 minutos. Se disponível, o contador do site tem prioridade.' : timer.source === 'orders' ? 'Contagem local: 10 minutos desde a primeira entrada neste pedido nesta sessão do programa. Recarregar não reinicia o prazo. Confira a validade na Meaple.' : timer.seconds === 0 ? 'Confira na Meaple se o carrinho expirou antes de prosseguir.' : 'Espelha o contador da Meaple nesta janela. O prazo não é prolongado pelo programa.';
    $('cart-overview').hidden = !state.tabs.length;
    $('cart-overview-title').textContent = `Visão geral · ${state.tabs.length} ${state.tabs.length === 1 ? 'janela aberta' : 'janelas abertas'}`;
    const list = $('cart-list');
    const signature = JSON.stringify(state.tabs.map(item => [item.id, item.profileId, state.profiles.find(profile => profile.id === item.profileId)?.label]));
    if (list.dataset.structure !== signature) {
      list.replaceChildren(); list.dataset.structure = signature;
      for (const item of state.tabs) {
        const row = node('div', '', 'cart-row'); row.dataset.tab = item.id;
        const label = state.profiles.find(profile => profile.id === item.profileId)?.label || 'Perfil';
        const index = state.tabs.filter(other => other.profileId === item.profileId).findIndex(other => other.id === item.id) + 1;
        const main = node('div', '', 'record-main'); main.append(node('strong', `${label} · Janela ${index}`), node('p', '', 'cart-caption'));
        main.append(node('span', '', 'tag used profile-used'));
        main.append(node('span', '', 'tag queue-status'));
        const time = node('strong', '', 'cart-row-time'); time.setAttribute('role', 'timer'); time.setAttribute('aria-live', 'off');
        row.append(main, time, button('Selecionar', 'cartTab', item.id)); list.append(row);
      }
    }
    for (const item of state.tabs) {
      const row = list.querySelector(`[data-tab="${item.id}"]`);
      row.dataset.urgency = urgency(item.timer);
      row.querySelector('.cart-row-time').textContent = clockText(item.timer);
      const used = row.querySelector('.profile-used'), profile = state.profiles.find(profile => profile.id === item.profileId);
      used.hidden = !profile?.lastFilledAt;
      used.textContent = profile?.lastFilledAt ? `Utilizado · ${dateTime(profile.lastFilledAt)}` : '';
      const queue = row.querySelector('.queue-status'); queue.textContent = queueLabel(item.queue); queue.dataset.queue = item.queue || 'unknown';
      row.querySelector('.cart-caption').textContent = item.timer ? `${item.timer.source === 'orders' ? 'Contagem local · ' : ''}${item.timer.seconds === 0 ? 'Contador esgotado' : item.timer.seconds <= 120 ? '2 minutos ou menos' : item.timer.source === 'orders' ? '10 min por pedido' : 'Contador da Meaple'}` : item.loading ? 'Carregando…' : 'Tempo não identificado';
      const control = row.querySelector('button');
      control.textContent = item.id === tab?.id ? 'Selecionada' : 'Selecionar';
      control.setAttribute('aria-pressed', String(item.id === tab?.id));
    }
  }
  function renderBrowser() {
    if (!state) return;
    options($('desktop-profile'), state.profiles.map(item => { const queue = profileQueue(item.id); return [`${item.label}${item.lastFilledAt ? ' · Utilizado' : ''}${queue.status !== 'unknown' ? ` · ${queue.text}` : ''}`, item.id]; }), state.profileId);
    const tabs = state.tabs.filter(item => item.profileId === state.profileId);
    options($('desktop-target'), tabs.length ? tabs.map((item, index) => [`Janela ${index + 1} · ${new URL(item.url).hostname || 'abrindo…'} · ${queueLabel(item.queue)}`, item.id]) : [['Abra a Meaple neste perfil', '']], state.tab?.id);
    $('desktop-count').textContent = `${state.profiles.length} salvos · ${state.tabs.length} janelas abertas`;
    const selectedProfile = state.profiles.find(item => item.id === state.profileId);
    $('selected-browser-label').textContent = selectedProfile ? `${selectedProfile.label}${selectedProfile.lastFilledAt ? ' · Utilizado' : ''}` : '';
    $('desktop-state').textContent = state.error || (state.loading ? 'Carregando a Meaple…' : state.tab ? 'Somente a janela selecionada acima receberá os dados.' : 'Clique em Abrir / ver Meaple para começar neste perfil.');
    renderTimers();
    syncTicketDraft();
    const launch = state.launch;
    let launchText = `Cole o link do evento para abrir em ${state.profiles.length} ${state.profiles.length === 1 ? 'perfil' : 'perfis'}.`;
    if (launch?.running) launchText = `Preparando perfis: ${launch.processed} de ${launch.total}…`;
    else if (launch?.processed) launchText = `Última abertura: ${launch.created} ${launch.created === 1 ? 'nova janela' : 'novas janelas'} · ${launch.reused} reaproveitadas${launch.failed.length ? ` · Falha ao abrir: ${launch.failed.join(', ')}` : ''}. Confira o carregamento do evento em cada janela.`;
    for (const label of document.querySelectorAll('[data-launch-state]')) label.textContent = launchText;
    const list = $('browsers-list');
    const signature = JSON.stringify([state.profiles, state.profileId, state.tabs.map(item => [item.id, item.profileId])]);
    if (list.dataset.structure === signature) { renderProfileQueues(); return; }
    list.dataset.structure = signature; list.replaceChildren();
    for (const profile of state.profiles) {
      const row = node('div', '', 'record-row'); const main = node('div', '', 'record-main');
      row.dataset.browserProfile = profile.id;
      main.append(node('strong', profile.label), node('p', `${state.tabs.filter(tab => tab.profileId === profile.id).length} janelas abertas${profile.id === state.profileId ? ' · Selecionado' : ''}`));
      main.append(node('span', '', 'tag profile-queue'));
      const actions = node('div', '', 'actions');
      if (profile.lastFilledAt) {
        main.append(node('span', `Utilizado · ${dateTime(profile.lastFilledAt)}`, 'tag used'));
        const clear = button('Limpar marcação', 'clearProfileUse', profile.id, 'text-button'); clear.dataset.usedAt = profile.lastFilledAt; actions.append(clear);
      }
      actions.append(button('Usar este perfil ↗', 'useProfile', profile.id));
      row.append(node('div', '▦', 'avatar'), main, actions); list.append(row);
    }
    renderProfileQueues();
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
      if (order.tickets?.items.length) main.append(node('p', `${order.tickets.event || 'Evento não informado'} · ${order.tickets.items.map(item => `${item.quantity ?? '?'} × ${item.description || 'Ingresso'} · ${item.lot || 'Lote não informado'} · ${money(item.unitCents)}`).join(' / ')}`));
      const actions = node('div', '', 'actions');
      if (order.status === 'pending') actions.append(button('Registrar pagamento', 'confirmOrder', order.id), button('Cancelar registro', 'cancelOrder', order.id, 'quiet'));
      if (order.status === 'confirmed') actions.append(button('Desfazer registro', 'reverseOrder', order.id, 'quiet'));
      if (['pending', 'confirmed'].includes(order.status)) actions.append(button('Conferir ingressos', 'editTickets', order.id, 'quiet'));
      result.append(main, actions); return result;
    }
    for (const order of orders) {
      if (order.status === 'pending') pending.append(row(order));
      if ($('history-filter').value === 'all' || $('history-filter').value === order.status) history.append(row(order));
    }
    if (!pending.children.length) empty(pending, 'Nenhum pagamento aguardando registro.', 'Ao preencher um checkout, ele aparecerá aqui.');
    if (!history.children.length) empty(history, 'Seu histórico começa na próxima compra.', 'Os registros ficam salvos no cofre e podem ser consultados depois.');
  }
  function render() { renderVault(); renderBrowser(); renderProfiles(); renderOrders(); renderStock(); controls(); }
  const tabKey = tab => tab ? `${tab.id}:${tab.revision}:${tab.url}` : '';
  function ticketRows(prefix, items) {
    const target = $(`${prefix}-rows`); target.replaceChildren();
    for (const item of items) addTicketRow(prefix, item);
  }
  function addTicketRow(prefix, item = { quantity: 1 }) {
    const row = node('div', '', 'ticket-line'); row.dataset.ticketId = item.id || crypto.randomUUID();
    for (const [field, title, value] of [['description', 'Ingresso / setor', item.description], ['lot', 'Lote', item.lot], ['quantity', 'Quantidade', item.quantity], ['unit', 'Valor unitário (R$)', item.unit ?? inputMoney(item.unitCents)]]) {
      const label = node('label', title), input = node('input'); input.dataset.ticketField = field; input.value = value ?? '';
      input.maxLength = field === 'description' ? 160 : field === 'lot' ? 80 : 20;
      if (field === 'quantity') { input.type = 'number'; input.min = '1'; input.max = '1000'; input.step = '1'; }
      if (field === 'quantity' || field === 'unit') input.inputMode = field === 'quantity' ? 'numeric' : 'decimal';
      label.append(input); row.append(label);
    }
    const remove = button('Remover', 'removeTicket', prefix, 'quiet'); row.append(remove); $(`${prefix}-rows`).append(row);
  }
  function ticketDraft(prefix = 'ticket') {
    return { event: $(`${prefix}-event`).value, items: [...$(`${prefix}-rows`).children].map(row => ({ id: row.dataset.ticketId, ...Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.dataset.ticketField, input.value])) })) };
  }
  function parsedTickets(prefix = 'ticket') {
    const draft = ticketDraft(prefix);
    return CheckoutTickets.normalize({ event: draft.event, items: draft.items.map(item => ({ ...item, unitCents: item.unit.trim() ? cents(item.unit) : null })) });
  }
  function syncTicketDraft() {
    if (!wallet.unlocked) return;
    const key = tabKey(state?.tab);
    if (key !== draftKey) {
      if (draftKey) ticketDrafts.set(draftKey, { ...ticketDraft(), dirty: ticketDirty, amount: $('purchase-amount').value, amountDirty });
      if (ticketDrafts.size > 200) ticketDrafts.delete(ticketDrafts.keys().next().value);
      draftKey = key; ticketRequest++;
      const cached = ticketDrafts.get(key);
      $('ticket-event').value = cached?.event || ''; ticketRows('ticket', cached?.items || []);
      ticketDirty = cached?.dirty || false; amountDirty = cached?.amountDirty || false;
      $('purchase-amount').value = cached?.amount || ''; renderSelection();
      requestedKey = cached ? key : '';
      $('ticket-read-state').textContent = cached ? 'Dados desta janela restaurados. Confira o resumo atual antes de comprar.' : 'Resumo ainda não identificado. Você pode informar evento, lote, quantidade e preço manualmente.';
    }
    if (key && !state.tab.loading && requestedKey !== key) { requestedKey = key; void refreshTickets(false); }
  }
  async function refreshTickets(replace) {
    if (!wallet.unlocked || !state?.tab) return;
    const key = draftKey, request = ++ticketRequest, id = state.tab.id;
    $('ticket-read-state').textContent = 'Lendo o resumo da janela selecionada…';
    try {
      const result = await bridge.tickets(id);
      if (!wallet.unlocked || key !== draftKey || request !== ticketRequest) return;
      if (!ticketDirty || replace) {
        $('ticket-event').value = result.event || ''; ticketRows('ticket', result.items || []); ticketDirty = false;
      }
      if (!amountDirty && result.totalCents != null) { $('purchase-amount').value = inputMoney(result.totalCents); renderSelection(); }
      $('ticket-read-state').textContent = ticketDirty && !replace ? 'Edição manual mantida. Use Ler resumo para substituir pelos dados do site.' : result.items?.length ? 'Resumo lido da Meaple. Confira lote, quantidade e valor unitário; complete os campos em branco.' : 'Resumo não identificado. Informe os dados manualmente ou tente ler novamente no checkout.';
    } catch {
      if (key === draftKey && request === ticketRequest && wallet.unlocked) $('ticket-read-state').textContent = 'Não foi possível ler este resumo. Informe os ingressos manualmente ou tente novamente na Meaple.';
    }
  }
  function openTickets(id) {
    if (!wallet.unlocked) return;
    const order = wallet.orders().find(item => item.id === id && ['pending', 'confirmed'].includes(item.status));
    if (!order) return;
    editTicketOrder = id; $('ticket-edit-event').value = order.tickets?.event || ''; ticketRows('ticket-edit', order.tickets?.items || []);
    $('ticket-edit-error').textContent = ''; $('ticket-dialog').showModal();
  }
  function renderStock() {
    const orders = wallet.unlocked ? wallet.orders().filter(order => order.status === 'confirmed') : [];
    const target = $('tickets-stock'); target.replaceChildren();
    const count = orders.reduce((sum, order) => sum + (order.tickets?.items || []).reduce((n, item) => n + (item.quantity || 0), 0), 0);
    const review = orders.filter(order => !CheckoutTickets.ready(order)).length;
    $('tickets-totals').textContent = wallet.unlocked ? `${count} ingressos com quantidade informada · ${orders.length} compras pagas · Custo total: ${money(orders.reduce((sum, order) => sum + order.amountCents, 0))}${review ? ` · ${review} compras precisam de revisão` : ''}` : 'Desbloqueie o cofre para consultar os ingressos.';
    for (const order of orders) {
      const card = node('article', '', 'surface stock-order'), header = node('div', '', 'section-heading');
      const title = node('div'); title.append(node('h2', order.tickets?.event || 'Evento não informado'), node('p', `${dateTime(order.confirmedAt)} · Total pago ${money(order.amountCents)}${order.reference ? ` · Pedido ${order.reference}` : ''}`, 'hint'));
      header.append(title, button('Conferir ingressos', 'editTickets', order.id, 'secondary')); card.append(header);
      if (!CheckoutTickets.ready(order)) card.append(node('p', 'Revisar dados: complete evento, ingresso, lote, quantidade e valor unitário.', 'callout'));
      const allocated = CheckoutTickets.costs(order);
      for (const [index, item] of (order.tickets?.items || []).entries()) {
        const row = node('div', '', 'stock-line'); row.dataset.stockItem = item.id;
        const average = allocated[index] != null && item.quantity ? allocated[index] / item.quantity : null;
        row.append(node('strong', `${item.quantity ?? '?'} × ${item.description || 'Ingresso não informado'} · ${item.lot || 'Lote não informado'}`), node('p', `Ingresso: ${money(item.unitCents)} cada · Custo total com taxas: ${money(allocated[index])} · Custo médio por ingresso: ${money(average)}`, 'hint'));
        const label = node('label', 'Preço de revenda por ingresso (R$)'), input = node('input'); input.inputMode = 'decimal'; input.dataset.resaleKey = `${order.id}:${item.id}`; input.value = resaleDrafts.get(input.dataset.resaleKey) ?? inputMoney(item.resaleCents); input.maxLength = 20; label.append(input);
        const save = button('Salvar preço', 'saveResale', order.id, 'secondary'); save.dataset.item = item.id;
        const actions = node('div', '', 'resale-actions'); actions.append(label, save); row.append(actions);
        row.append(node('p', resaleDrafts.has(input.dataset.resaleKey) ? 'Alteração ainda não salva. O CSV usa os preços salvos.' : '', 'hint resale-note'));
        const revenue = item.resaleCents != null && item.quantity != null ? item.resaleCents * item.quantity : null;
        row.append(node('p', `Receita prevista: ${money(revenue)} · Resultado previsto: ${money(revenue != null && allocated[index] != null ? revenue - allocated[index] : null)}`, 'hint'));
        card.append(row);
      }
      target.append(card);
    }
    if (!orders.length) empty(target, 'Seus ingressos aparecerão aqui após registrar o pagamento.', 'Compras pendentes, canceladas e registros desfeitos não entram nesta lista.');
  }
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
    const eventLink = $('event-link').value;
    ticketRequest++; draftKey = requestedKey = ''; ticketDrafts.clear(); resaleDrafts.clear(); ticketDirty = amountDirty = false;
    $('ticket-event').value = ''; ticketRows('ticket', []); $('ticket-edit-event').value = ''; ticketRows('ticket-edit', []);
    if ($('ticket-dialog').open) $('ticket-dialog').close(); editTicketOrder = '';
    $('ticket-read-state').textContent = 'Desbloqueie o cofre para ler e salvar os ingressos.';
    for (const id of ['buyer-form', 'card-form', 'checkout', 'vault-form', 'pin-form']) $(id).reset();
    for (const input of document.querySelectorAll('[data-event-link]')) input.value = eventLink;
    for (const id of ['buyer-editor', 'card-editor']) $(id).hidden = true;
    $('import-data').value = ''; $('buyer-search').value = '';
    if ($('order-dialog').open) $('order-dialog').close();
    $('order-form').reset(); activeOrderId = '';
  }
  async function expire() {
    await lock(); render(); message(currentView === 'news' ? 'Cofre bloqueado. As novidades continuam disponíveis.' : 'Cofre bloqueado. Desbloqueie para continuar.');
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
    if (control.dataset.clearProfileUse) {
      if (!globalThis.confirm('Limpar a marca Utilizado deste perfil? A utilização dos CPFs e o histórico de compras serão mantidos.')) return;
      void run(async () => { state = await bridge.clearBrowserUse(control.dataset.clearProfileUse, Number(control.dataset.usedAt)); }, 'Marcação do perfil removida.');
    }
    if (control.dataset.newsOpen) void newsAction(() => bridge.openNews(control.dataset.newsOpen, control.dataset.newsKind, control.dataset.newsKey || ''), true);
    if (control.hasAttribute('data-open-all')) void run(async () => {
      state = await bridge.openAll($('event-link').value);
      const failed = state.launch.failed;
      message(failed.length ? `Não foi possível abrir ${failed.length} perfis. Confira a lista de falhas e tente novamente.` : 'Janelas preparadas para todos os perfis. Aguarde o carregamento do evento.', failed.length ? 'error' : 'success');
    });
    if (control.dataset.new) editor(control.dataset.new);
    if (control.dataset.close) $(control.dataset.close).hidden = true;
    if (control.dataset.editBuyer) editor('buyer', control.dataset.editBuyer);
    if (control.dataset.editCard) editor('card', control.dataset.editCard);
    if (control.dataset.editTickets) openTickets(control.dataset.editTickets);
    if (control.dataset.removeTicket) { control.closest('.ticket-line').remove(); if (control.dataset.removeTicket === 'ticket') ticketDirty = true; }
    if (control.dataset.saveResale) void run(async () => {
      const input = control.closest('.stock-line').querySelector('input');
      await wallet.setResalePrice(control.dataset.saveResale, control.dataset.item, input.value);
      resaleDrafts.delete(input.dataset.resaleKey);
    }, 'Preço de revenda salvo.');
    if (control.dataset.useProfile) void run(async () => { state = await bridge.selectBrowser(control.dataset.useProfile); state = await bridge.open(); navigate('buy'); });
    if (control.dataset.confirmOrder) openOrder(control.dataset.confirmOrder);
    if (control.dataset.cancelOrder && globalThis.confirm('Cancelar este registro pendente? Nenhum valor será descontado do limite.')) void run(() => wallet.finishOrder(control.dataset.cancelOrder, 'canceled'), 'Registro pendente cancelado.');
    if (control.dataset.reverseOrder && globalThis.confirm('Desfazer este registro no programa e devolver o valor ao disponível? Isso não cancela nem estorna o pagamento no banco.')) void run(() => wallet.finishOrder(control.dataset.reverseOrder, 'reversed'), 'Registro desfeito. O valor voltou ao disponível no programa.');
  });
  $('vault-form').addEventListener('submit', event => {
    event.preventDefault(); void run(async () => {
      try {
        if (!exists && $('vault-password').value !== $('vault-confirm').value) throw new Error('Os PINs precisam ser iguais.');
        if (exists) await wallet.unlock($('vault-password').value); else await wallet.create($('vault-password').value);
        exists = true; await refreshUsage();
        if (!wallet.pinConfigured) navigate('settings');
        message(wallet.pinConfigured ? 'Cofre desbloqueado por até 30 minutos.' : 'Senha anterior confirmada. Defina o novo PIN abaixo para concluir a troca.');
      } finally { $('vault-password').value = $('vault-confirm').value = ''; }
    });
  });
  $('pin-form').addEventListener('submit', event => {
    event.preventDefault(); void run(async () => {
      try {
        if ($('new-pin').value !== $('confirm-pin').value) throw new Error('Os PINs precisam ser iguais.');
        await wallet.changePassword($('new-pin').value);
      } finally { $('pin-form').reset(); }
    }, 'PIN salvo. Seus cadastros foram mantidos. O cofre fica desbloqueado por até 30 minutos.');
  });
  $('vault-lock').addEventListener('click', () => { void run(lock, 'Cofre bloqueado. Seus dados continuam salvos.'); });
  $('vault-reset').addEventListener('click', () => {
    if (!globalThis.confirm('Apagar todos os compradores, cartões, CVVs salvos e o histórico financeiro? Não é possível desfazer. O contato, os perfis de navegação e as marcações de CPF serão mantidos.')) return;
    void run(async () => { await wallet.reset(); await lock(); exists = false; }, 'Cofre apagado. Crie um novo PIN para recomeçar.');
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
  $('purchase-amount').addEventListener('input', () => { amountDirty = true; });
  $('ticket-event').addEventListener('input', () => { ticketDirty = true; });
  $('ticket-rows').addEventListener('input', () => { ticketDirty = true; });
  $('ticket-add').addEventListener('click', () => { addTicketRow('ticket'); ticketDirty = true; });
  $('ticket-refresh').addEventListener('click', () => {
    if (ticketDirty && !globalThis.confirm('Substituir as edições dos ingressos pelo resumo atual desta janela?')) return;
    void run(() => refreshTickets(true));
  });
  $('ticket-edit-add').addEventListener('click', () => addTicketRow('ticket-edit'));
  $('ticket-edit-close').addEventListener('click', () => $('ticket-dialog').close());
  $('ticket-dialog').addEventListener('close', () => { editTicketOrder = ''; $('ticket-edit-event').value = ''; ticketRows('ticket-edit', []); $('ticket-edit-error').textContent = ''; });
  $('ticket-edit-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !editTicketOrder) return;
    busy = true; controls();
    try { await wallet.updateTickets(editTicketOrder, parsedTickets('ticket-edit')); $('ticket-dialog').close(); message('Ingressos atualizados. O total pago foi preservado.'); }
    catch (error) { $('ticket-edit-error').textContent = error.message; }
    finally { busy = false; render(); }
  });
  $('tickets-export').addEventListener('click', () => { void run(async () => { const saved = await bridge.exportTickets(CheckoutTickets.csv(wallet.orders())); message(saved ? 'CSV exportado. Inclui somente compras registradas como pagas, sem CPF ou dados de cartão.' : 'Exportação cancelada.'); }); });
  $('tickets-stock').addEventListener('input', event => {
    if (!event.target.dataset.resaleKey) return;
    resaleDrafts.set(event.target.dataset.resaleKey, event.target.value);
    event.target.closest('.stock-line').querySelector('.resale-note').textContent = 'Alteração ainda não salva. O CSV usa os preços salvos.';
  });
  $('history-filter').addEventListener('change', renderOrders);
  $('desktop-profile').addEventListener('change', () => { void run(async () => { state = await bridge.selectBrowser($('desktop-profile').value); }); });
  $('desktop-target').addEventListener('change', () => { void run(async () => { state = await bridge.selectTab(Number($('desktop-target').value)); }); });
  $('desktop-open').addEventListener('click', () => { void run(async () => { state = await bridge.open(); }); });
  $('news-enabled').addEventListener('change', () => { const enabled = $('news-enabled').checked; void newsAction(() => bridge.configureNews(enabled), true); });
  $('news-check').addEventListener('click', () => { void newsAction(() => bridge.checkNews()); });
  $('news-read').addEventListener('click', () => { void newsAction(() => bridge.readNews()); });
  bridge.onNews(next => { newsState = next; renderNews(); });
  void bridge.news().then(next => { newsState = next; renderNews(); }).catch(() => { $('news-message').textContent = 'Não foi possível carregar as novidades. Os demais recursos continuam disponíveis.'; $('news-message').hidden = false; });
  for (const input of document.querySelectorAll('[data-event-link]')) {
    input.addEventListener('input', () => {
      for (const other of document.querySelectorAll('[data-event-link]')) if (other !== input) other.value = input.value;
    });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault(); input.closest('.event-launch').querySelector('[data-open-all]').click();
    });
  }
  $('cart-list').addEventListener('click', event => {
    const control = event.target.closest('[data-cart-tab]');
    if (!control) return;
    const tab = state.tabs.find(item => item.id === Number(control.dataset.cartTab));
    if (!tab) return;
    void run(async () => {
      if (tab.profileId !== state.profileId) state = await bridge.selectBrowser(tab.profileId);
      state = await bridge.selectTab(tab.id); navigate('buy');
    });
  });
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
      if (tabKey(destination.tab) === draftKey && !ticketDirty) await refreshTickets(false);
      const tickets = tabKey(destination.tab) === draftKey ? parsedTickets() : { event: '', items: [] };
      const profile = destination.profiles.find(item => item.id === destination.profileId);
      const orderId = await wallet.stageOrder({ scope: `${runtime}:${destination.tab.id}`, cardId: card.id, buyer: buyer.label, buyerId: buyer.id, profile: profile.label, amount: $('purchase-amount').value, tickets });
      const data = Object.fromEntries([...CheckoutVault.buyerFields.map(field => [field, buyer.values[field]]), ...CheckoutVault.cardFields.map(field => [field, card.values[field] || '']), ['email', contact.email], ['phone', contact.phone], ['cardCvv', cvv], ['installments', $('purchase-installments').value]]);
      $('status').textContent = 'Preenchendo o checkout…'; $('status').dataset.kind = ''; $('details').replaceChildren();
      try {
        await bridge.prepare(destination.tab.id);
        const result = await bridge.fill(destination.tab.id, data);
        $('status').textContent = `${result.filled.length} itens preenchidos. ${result.pending.length ? 'Confira as pendências abaixo.' : 'Revise e finalize na Meaple.'}`;
        for (const item of result.pending) $('details').append(node('li', item));
        if (result.profileUsageError) message(result.profileUsageError, 'error');
        else message('Checkout preenchido. Após pagar na Meaple, use Registrar pagamento para atualizar o limite.');
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
