(() => {
  'use strict';
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const fields = [
    ['buyerName', 'Nome do comprador', ['nome completo', 'nome do comprador', 'buyer name', 'full name']],
    ['cpf', 'CPF', ['cpf', 'digite o cpf', 'documento', 'document']],
    ['email', 'E-mail', ['e mail', 'email']],
    ['phone', 'Telefone', ['telefone', 'digite o telefone', 'celular', 'phone', 'tel']],
    ['birthDate', 'Nascimento', ['data de nascimento', 'nascimento', 'birth date', 'birthdate', 'dd mm aaaa']],
    ['cardNumber', 'Número do cartão', ['numero do cartao', 'card number', 'cardnumber', 'cc number', '1234 1234 1234 1234']],
    ['cardHolder', 'Titular do cartão', ['nome do titular', 'nome do titular do cartao', 'card holder', 'cardholder', 'cc name']],
    ['cardExpiry', 'Validade', ['validade', 'validade do cartao', 'expiration', 'expiry', 'cc exp', 'mm aa', 'mm yy', 'mm aaaa', 'mm yyyy']],
    ['cardCvv', 'CVV', ['cvv', 'cvc', 'codigo de seguranca', 'security code', 'cc csc']],
    ['country', 'País', ['pais', 'country', 'selecione o pais']],
    ['postalCode', 'CEP', ['cep', 'postal code', 'postalcode', 'zip', '00000 000', '00 000 000']],
    ['city', 'Cidade', ['cidade', 'digite a cidade', 'city']],
    ['state', 'Estado', ['estado', 'selecione o estado', 'state', 'uf']],
    ['street', 'Rua', ['rua', 'digite sua rua', 'logradouro', 'street', 'address line1']],
    ['streetNumber', 'Número do endereço', ['numero', 'digite o numero', 'numero do endereco', 'address number']],
    ['installments', 'Parcelas', ['parcelas', 'parcela', 'selecione uma parcela', 'installments']]
  ];
  const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function visible(element) {
    for (let node = element; node instanceof Element; node = node.parentElement) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return !element.disabled && !element.readOnly && element.type !== 'hidden';
  }

  function names(element) {
    const labels = Array.from(element.labels || []).map(label => {
      const clone = label.cloneNode(true);
      clone.querySelectorAll('input,select,textarea,button').forEach(node => node.remove());
      return clone.textContent;
    });
    const labelledBy = (element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent);
    return [...labels, ...labelledBy, element.getAttribute('aria-label'), element.getAttribute('placeholder'), element.getAttribute('autocomplete'), element.name, element.id].filter(Boolean).map(normalize);
  }

  function locate(aliases) {
    const candidates = Array.from(document.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=submit]):not([type=button]),select,textarea,[role=combobox]')).filter(visible);
    const scored = candidates.map(element => {
      const values = names(element);
      const score = Math.max(0, ...values.flatMap(value => aliases.map(alias => value === alias ? 100 : value.startsWith(alias + ' ') && alias.length > 5 ? 50 : 0)));
      return { element, score };
    }).filter(item => item.score).sort((a, b) => b.score - a.score);
    if (!scored.length) return { reason: 'campo não encontrado' };
    if (scored[1]?.score === scored[0].score) return { reason: 'mais de um campo possível; preencha manualmente' };
    return { element: scored[0].element };
  }

  function setValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) return false;
    element.focus();
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
    return element.value === value;
  }

  function matchesOption(option, value, key) {
    const text = normalize(option.textContent);
    const raw = normalize(option.value ?? option.getAttribute('data-value'));
    const wanted = normalize(value);
    if (text === wanted || raw === wanted) return true;
    if (key === 'country' && ['br', 'brasil', 'brazil'].includes(wanted)) return ['br', 'brasil', 'brazil'].includes(text) || raw === 'br';
    if (key === 'installments') return new RegExp('^' + Number(value) + '(?:x| x| parcelas?)(?: |$)').test(text);
    if (key === 'state') {
      const states = {ac:'acre',al:'alagoas',ap:'amapa',am:'amazonas',ba:'bahia',ce:'ceara',df:'distrito federal',es:'espirito santo',go:'goias',ma:'maranhao',mt:'mato grosso',ms:'mato grosso do sul',mg:'minas gerais',pa:'para',pb:'paraiba',pr:'parana',pe:'pernambuco',pi:'piaui',rj:'rio de janeiro',rn:'rio grande do norte',rs:'rio grande do sul',ro:'rondonia',rr:'roraima',sc:'santa catarina',sp:'sao paulo',se:'sergipe',to:'tocantins'};
      return states[wanted] === text || text === `${states[wanted]} ${wanted}` || text === `${wanted} ${states[wanted]}`;
    }
    return false;
  }

  async function writeField(key, aliases, value) {
    if (key === 'birthDate' && globalThis.CheckoutDates) value = CheckoutDates.birth(value);
    if (key === 'cardExpiry' && globalThis.CheckoutDates) value = CheckoutDates.expiry(value);
    let found;
    for (let attempt = 0; attempt < 6; attempt++) {
      found = locate(aliases);
      const element = found.element;
      if (element instanceof HTMLSelectElement) {
        const options = Array.from(element.options).filter(option => !option.disabled && option.value && matchesOption(option, value, key));
        if (options.length === 1) return setValue(element, options[0].value) ? null : 'valor não aceito';
      } else if (element?.getAttribute('role') === 'combobox') {
        // Custom controls: click only the matching control and a unique, visible option.
        element.click();
        await pause(60);
        const options = Array.from(document.querySelectorAll('[role=option]')).filter(option => visible(option) && option.getAttribute('aria-disabled') !== 'true' && matchesOption(option, value, key));
        if (options.length === 1) { options[0].click(); return null; }
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      } else if (element) {
        let formatted = value;
        if (element.type === 'date' && key === 'birthDate') formatted = value.split('/').reverse().join('-');
        if (element.type === 'month' && key === 'cardExpiry') formatted = `20${value.slice(-2)}-${value.slice(0, 2)}`;
        else if (key === 'cardExpiry' && /mm[ /-]+(aaaa|yyyy)/i.test(element.placeholder || '')) formatted = `${value.slice(0, 2)}/20${value.slice(-2)}`;
        return setValue(element, formatted) ? null : 'valor não aceito; confira a máscara';
      }
      // Wait only for asynchronous dependent controls, such as state/installments.
      if (!['country', 'state', 'installments'].includes(key)) break;
      await pause(120);
    }
    return found?.element ? 'opção indisponível; selecione no site' : found?.reason || 'campo não encontrado';
  }

  async function declineInsurance() {
    const labels = Array.from(document.querySelectorAll('label')).filter(element => visible(element) && /^nao preciso (da protecao|do seguro)( |$)/.test(normalize(element.textContent)));
    if (labels.length !== 1) return false;
    const label = labels[0];
    const control = label.control || (label.htmlFor && document.getElementById(label.htmlFor)) || label.querySelector('input[type=radio], [role=radio]');
    if (!control || control.disabled || !(control.type === 'radio' || control.getAttribute('role') === 'radio')) return false;
    if (control.checked || control.getAttribute('aria-checked') === 'true') return true;
    control.click();
    await pause(50);
    return control.checked || control.getAttribute('aria-checked') === 'true';
  }

  async function fillCheckout(data) {
    const filled = [];
    const pending = [];
    // Prevent native/React form submission while operating payment tabs/controls.
    const blockSubmit = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    document.addEventListener('submit', blockSubmit, true);
    try {
      const buttons = Array.from(document.querySelectorAll('button, [role=tab]')).filter(element => visible(element) && normalize(element.textContent) === 'cartao de credito');
      if (buttons.length === 1) { buttons[0].click(); await pause(100); }
      for (const [key, title, aliases] of fields) {
        if (!data[key]) { if (key === 'installments') pending.push('Parcelas: confira a seleção no site.'); continue; }
        const error = await writeField(key, aliases, String(data[key]));
        if (error) pending.push(`${title}: ${error}.`);
        else filled.push(title);
      }
      if (await declineInsurance()) filled.push('Seguro recusado');
      else pending.push('Seguro: não foi possível confirmar “Não preciso da proteção”; confira no site.');
      if (Array.from(document.querySelectorAll('iframe')).some(visible)) pending.push('Há conteúdo em iframe. Campos de pagamento dentro dele precisam de integração específica ou preenchimento manual.');
      return { filled, pending };
    } finally {
      document.removeEventListener('submit', blockSubmit, true);
    }
  }
  globalThis.CheckoutAssist = { fillCheckout };
})();
