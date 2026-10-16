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
  const status = document.querySelector('#desktop-state');
  function render(state) { status.textContent = state.error || (state.loading ? 'Carregando o site…' : state.tab ? `Site: ${new URL(state.tab.url).hostname || 'abrindo…'}` : 'Abra o site para montar o carrinho.'); }
  bridge.onState(render);
  bridge.checkout().then(render).catch(() => { status.textContent = 'Não foi possível consultar a janela do site.'; });
  document.querySelector('#desktop-open').addEventListener('click', () => { bridge.open().then(render).catch(() => { status.textContent = 'Não foi possível abrir o site. Tente novamente.'; }); });
  bridge.onExpired(() => { document.querySelector('#vault-lock')?.click(); });
})();
