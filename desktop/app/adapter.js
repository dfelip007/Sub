(() => {
  'use strict';
  const bridge = globalThis.desktopBridge;
  const area = name => ({
    get: key => bridge.read(name, key),
    set: values => bridge.write(name, values),
    remove: key => bridge.remove(name, key),
    async setAccessLevel({ accessLevel }) { if (accessLevel !== 'TRUSTED_CONTEXTS') throw new Error('Acesso inválido.'); }
  });
  globalThis.chrome = {
    storage: { local: area('local'), session: area('session') },
    tabs: { query: async () => { const state = await bridge.checkout(); return state.tab ? [state.tab] : []; } },
    scripting: {
      async executeScript(options) {
        if (options.files) {
          if (JSON.stringify(options.files) !== JSON.stringify(['src/dates.js', 'src/fill.js'])) throw new Error('Arquivo de preenchimento inválido.');
          await bridge.prepare(options.target.tabId);
          return [{}];
        }
        if (!Array.isArray(options.args) || options.args.length !== 1) throw new Error('Preenchimento inválido.');
        return [{ result: await bridge.fill(options.target.tabId, options.args[0]) }];
      }
    }
  };
  const element = id => document.getElementById(id);
  const profile = element('desktop-profile');
  const target = element('desktop-target');
  const status = element('desktop-state');
  let state;
  let busy = false;
  let buyers = [];
  let usageVersion = 0;
  let currentUsage;
  let currentCpf = '';
  function options(select, entries, value) {
    const signature = JSON.stringify(entries);
    if (select.dataset.options !== signature) {
      select.replaceChildren(...entries.map(([label, id]) => new Option(label, String(id))));
      select.dataset.options = signature;
    }
    select.value = value == null ? '' : String(value);
  }
  function render(next) {
    state = next;
    options(profile, state.profiles.map(item => [item.label, item.id]), state.profileId);
    const tabs = state.tabs.filter(item => item.profileId === state.profileId);
    options(target, tabs.length ? tabs.map((item, index) => [`Janela ${index + 1} · ${new URL(item.url).hostname || 'abrindo…'}`, item.id]) : [['Nenhuma janela aberta', '']], state.tab?.id);
    target.disabled = busy || !tabs.length;
    element('desktop-count').textContent = `${state.profiles.length} perfis salvos · ${state.tabs.length} janelas abertas`;
    status.textContent = state.error || (state.loading ? 'Carregando o site…' : state.tab ? 'O preenchimento vai somente para a janela selecionada acima.' : 'Abra a Meaple neste perfil para montar o carrinho.');
    void refreshUsage();
  }
  async function action(run) {
    if (busy) return;
    busy = true;
    for (const control of document.querySelectorAll('.desktop-toolbar button, .desktop-toolbar select')) control.disabled = true;
    try { const result = await run(); if (result) render(result); }
    catch { status.textContent = 'Não foi possível atualizar o perfil. Confira o nome, a quantidade (máximo 100 perfis) e aguarde qualquer preenchimento terminar.'; }
    finally {
      busy = false;
      for (const control of document.querySelectorAll('.desktop-toolbar button, .desktop-toolbar select')) control.disabled = false;
      target.disabled = !state?.tab;
    }
  }
  profile.addEventListener('change', () => { void action(() => bridge.selectBrowser(profile.value)); });
  target.addEventListener('change', () => { void action(() => bridge.selectTab(Number(target.value))); });
  element('desktop-open').addEventListener('click', () => { void action(() => bridge.open()); });
  element('desktop-new-window').addEventListener('click', () => { void action(() => bridge.open(true)); });
  element('desktop-create').addEventListener('click', () => { void action(() => bridge.createBrowser(element('desktop-label').value, Number(element('desktop-quantity').value))); });
  element('desktop-rename').addEventListener('click', () => { void action(() => bridge.renameBrowser(profile.value, element('desktop-label').value)); });
  element('desktop-delete').addEventListener('click', () => {
    if (!state || state.profiles.length < 2) { status.textContent = 'Mantenha pelo menos um perfil de navegação.'; return; }
    if (!globalThis.confirm('Excluir este perfil de navegação e seus cookies? As janelas deste perfil serão fechadas. As marcações de CPF utilizado serão mantidas.')) return;
    void action(() => bridge.removeBrowser(profile.value));
  });
  const cpfInput = document.querySelector('[name=cpf]');
  const usageText = element('desktop-usage-state');
  const used = element('desktop-used');
  const validCpf = value => typeof value === 'string' && /^[\d.\-\s]+$/.test(value) && value.replace(/\D/g, '').length === 11;
  async function refreshUsage() {
    const version = ++usageVersion;
    const cpf = cpfInput.value;
    const known = buyers.filter(item => validCpf(item.cpf));
    const valid = validCpf(cpf);
    used.disabled = true;
    try {
      const result = await bridge.usage([...known.map(item => item.cpf), ...(valid ? [cpf] : [])]);
      if (version !== usageVersion) return;
      for (const [index, buyer] of known.entries()) {
        const option = [...element('buyer-profile').options].find(item => item.value === buyer.id);
        if (option) option.textContent = buyer.label + (result[index].status === 'used' ? ' · JÁ UTILIZADO' : '');
      }
      currentCpf = cpf;
      currentUsage = valid ? result.at(-1) : null;
      used.checked = currentUsage?.status === 'used';
      used.disabled = !valid;
      usageText.textContent = !valid ? 'Selecione um comprador ou informe o CPF.' : currentUsage.status === 'used'
        ? `Utilizado pela última vez em: ${new Date(currentUsage.at).toLocaleString('pt-BR')} · ${currentUsage.profile}`
        : 'Este CPF ainda não foi marcado como utilizado.';
      usageText.dataset.kind = used.checked ? 'used' : '';
    } catch {
      if (version !== usageVersion) return;
      currentUsage = null;
      usageText.textContent = 'Não foi possível consultar a última utilização. Confira antes de preencher.';
    }
  }
  used.addEventListener('change', async () => {
    const cpf = currentCpf;
    const expected = currentUsage;
    const marking = used.checked;
    used.disabled = true;
    try {
      if (!expected) return;
      if (!marking && !globalThis.confirm('Remover a marcação de utilizado deste CPF?')) return;
      if (marking) await bridge.markUsed(cpf); else await bridge.release(cpf, expected);
    } catch { status.textContent = 'Não foi possível alterar a marcação. Aguarde o preenchimento terminar e tente novamente.'; }
    finally { await refreshUsage(); }
  });
  cpfInput.addEventListener('input', () => { void refreshUsage(); });
  document.addEventListener('checkout-profiles', event => { buyers = event.detail; void refreshUsage(); });
  for (const id of ['buyer-profile', 'buyer-new', 'clear', 'import']) element(id).addEventListener(id === 'buyer-profile' ? 'change' : 'click', () => { setTimeout(() => { void refreshUsage(); }, 0); });
  bridge.onState(render);
  bridge.onUsage(() => { void refreshUsage(); });
  bridge.checkout().then(render).catch(() => { status.textContent = 'Não foi possível consultar as janelas do site.'; });
  bridge.onExpired(() => { element('vault-lock')?.click(); });
})();
