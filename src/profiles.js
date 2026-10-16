(() => {
  'use strict';
  const form = document.querySelector('#checkout');
  const vault = new CheckoutVault.Vault(chrome.storage);
  const message = document.querySelector('#vault-message');
  const password = document.querySelector('#vault-password');
  const confirm = document.querySelector('#vault-confirm');
  let exists = false;
  let busy = false;
  let timer;
  const groups = [
    { prefix: 'buyer', kind: 'buyers', fields: CheckoutVault.buyerFields },
    { prefix: 'card', kind: 'cards', fields: CheckoutVault.cardFields }
  ];
  const element = id => document.getElementById(id);
  function notify(text, kind = '') { message.textContent = text; message.dataset.kind = kind; }
  function clearGroup(group) {
    for (const field of group.fields) form.elements[field].value = field === 'country' ? 'Brasil' : '';
    element(`${group.prefix}-label`).value = '';
    element(`${group.prefix}-profile`).value = '';
    if (group.kind === 'cards') form.elements.cardCvv.value = '';
  }
  function render() {
    clearTimeout(timer);
    const unlocked = vault.unlocked;
    element('vault-state').textContent = unlocked ? 'Desbloqueado por até 15 min' : exists ? 'Bloqueado' : 'Crie sua senha';
    element('vault-form').hidden = unlocked;
    element('vault-confirm-label').hidden = exists;
    confirm.required = !exists;
    password.minLength = exists ? 1 : 10;
    element('vault-unlock').textContent = exists ? 'Desbloquear cofre' : 'Criar cofre';
    element('vault-unlock').disabled = busy;
    element('vault-lock').hidden = !unlocked;
    element('vault-reset').hidden = !exists;
    element('vault-lock').disabled = busy;
    element('vault-reset').disabled = busy;
    for (const group of groups) {
      for (const suffix of ['profile', 'label', 'save', 'new', 'delete']) element(`${group.prefix}-${suffix}`).disabled = !unlocked || busy;
      const select = element(`${group.prefix}-profile`);
      const selected = select.value;
      select.replaceChildren(new Option(group.kind === 'buyers' ? 'Novo comprador' : 'Novo cartão', ''));
      if (unlocked) for (const record of vault.list(group.kind)) {
        const title = group.kind === 'cards' ? `${record.label} · final ${record.values.cardNumber.replace(/\D/g, '').slice(-4)}` : record.label;
        select.add(new Option(title, record.id));
      }
      select.value = selected;
    }
    if (unlocked) timer = setTimeout(() => { void lock('Cofre bloqueado após 15 minutos. Desbloqueie para continuar.'); }, Math.max(0, vault.expiresAt - Date.now()));
  }
  async function action(run) {
    if (busy) return;
    busy = true;
    render();
    try { await run(); }
    catch (error) { notify(error.message || 'Não foi possível atualizar o cofre.', 'error'); }
    finally { busy = false; render(); }
  }
  async function lock(text = 'Cofre bloqueado. Os perfis continuam salvos com criptografia.') {
    await vault.lock();
    groups.forEach(clearGroup);
    element('import-data').value = '';
    password.value = confirm.value = '';
    notify(text);
    render();
  }
  element('vault-form').addEventListener('submit', event => {
    event.preventDefault();
    void action(async () => {
      try {
        if (!exists && password.value !== confirm.value) throw new Error('As senhas precisam ser iguais.');
        if (exists) await vault.unlock(password.value); else await vault.create(password.value);
        exists = true;
        notify('Cofre desbloqueado. Escolha um comprador e um cartão.', 'success');
      } finally { password.value = confirm.value = ''; }
    });
  });
  element('vault-lock').addEventListener('click', () => { void action(() => lock()); });
  element('vault-reset').addEventListener('click', () => {
    if (!globalThis.confirm('Apagar todos os compradores e cartões salvos? Essa ação não pode ser desfeita. O contato fixo será mantido.')) return;
    void action(async () => {
      await vault.reset();
      exists = false;
      groups.forEach(clearGroup);
      element('import-data').value = '';
      notify('Cofre apagado. Você pode criar outro com uma nova senha.');
    });
  });
  for (const group of groups) {
    const select = element(`${group.prefix}-profile`);
    select.addEventListener('change', () => {
      if (!vault.unlocked) { void lock('Desbloqueie o cofre para escolher um perfil.'); return; }
      const record = vault.list(group.kind).find(item => item.id === select.value);
      if (!record) { clearGroup(group); return; }
      for (const field of group.fields) form.elements[field].value = record.values[field] || (field === 'country' ? 'Brasil' : '');
      element(`${group.prefix}-label`).value = record.label;
      if (group.kind === 'cards') form.elements.cardCvv.value = '';
      CheckoutDates.apply(form);
      notify(`${group.kind === 'buyers' ? 'Comprador' : 'Cartão'} carregado. ${group.kind === 'cards' ? 'Informe o CVV desta compra.' : 'O contato fixo foi mantido.'}`, 'success');
    });
    element(`${group.prefix}-new`).addEventListener('click', () => clearGroup(group));
    element(`${group.prefix}-save`).addEventListener('click', () => {
      void action(async () => {
        CheckoutDates.apply(form);
        const values = Object.fromEntries(group.fields.map(field => [field, form.elements[field].value.trim()]));
        if (group.kind === 'buyers') {
          if (!values.buyerName || values.cpf.replace(/\D/g, '').length !== 11 || !CheckoutDates.validBirth(values.birthDate)) throw new Error('Confira nome, CPF e nascimento antes de salvar o comprador.');
        } else {
          if (!/^\d{13,19}$/.test(values.cardNumber.replace(/[ -]/g, '')) || !values.cardHolder || !CheckoutDates.validExpiry(values.cardExpiry)) throw new Error('Confira número, titular e validade antes de salvar o cartão.');
        }
        const id = await vault.save(group.kind, select.value, element(`${group.prefix}-label`).value, values);
        render();
        select.value = id;
        notify(group.kind === 'buyers' ? 'Comprador salvo no cofre.' : 'Cartão e endereço salvos no cofre. O CVV não é salvo.', 'success');
      });
    });
    element(`${group.prefix}-delete`).addEventListener('click', () => {
      if (!select.value) { notify('Selecione um perfil para excluir.', 'error'); return; }
      if (!globalThis.confirm('Excluir este perfil salvo?')) return;
      void action(async () => { await vault.remove(group.kind, select.value); clearGroup(group); notify('Perfil excluído.'); });
    });
  }
  document.addEventListener('checkout-clear', () => {
    for (const group of groups) { element(`${group.prefix}-profile`).value = ''; element(`${group.prefix}-label`).value = ''; }
  });
  void (async () => {
    try {
      await vault.restore();
      exists = Boolean(vault.envelope);
      render();
    } catch (error) { element('vault-form').hidden = true; notify(error.message, 'error'); }
  })();
})();
