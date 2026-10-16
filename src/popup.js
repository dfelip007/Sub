const form = document.querySelector('#checkout');
const status = document.querySelector('#status');
const details = document.querySelector('#details');
const fillButton = document.querySelector('#fill');
const sensitiveNames = ['cardNumber', 'cardHolder', 'cardExpiry', 'cardCvv'];
CheckoutDates.bind(form.elements.birthDate, 'birth');
CheckoutDates.bind(form.elements.cardExpiry, 'expiry');

function show(message, kind = '') {
  status.textContent = message;
  status.dataset.kind = kind;
  details.replaceChildren();
}

chrome.storage.local.get('contact').then(({ contact }) => {
  if (!contact) return;
  for (const name of ['email', 'phone']) {
    if (!form.elements[name].value) form.elements[name].value = contact[name] || '';
  }
}).catch(() => show('Não foi possível ler o contato salvo.', 'error'));

document.querySelector('#save-contact').addEventListener('click', async () => {
  if (!form.elements.email.reportValidity() || !form.elements.phone.reportValidity()) return;
  try {
    await chrome.storage.local.set({ contact: { email: form.elements.email.value.trim(), phone: form.elements.phone.value.trim() } });
    show('E-mail e telefone salvos neste navegador.', 'success');
  } catch { show('Não foi possível salvar o contato.', 'error'); }
});

document.querySelector('#forget-contact').addEventListener('click', async () => {
  try {
    await chrome.storage.local.remove('contact');
    form.elements.email.value = '';
    form.elements.phone.value = '';
    show('Contato salvo apagado.');
  } catch { show('Não foi possível apagar o contato salvo.', 'error'); }
});

document.querySelector('#clear').addEventListener('click', () => {
  const email = form.elements.email.value;
  const phone = form.elements.phone.value;
  form.reset();
  form.elements.email.value = email;
  form.elements.phone.value = phone;
  document.dispatchEvent(new Event('checkout-clear'));
  show('Dados desta compra removidos da extensão.');
});

document.querySelector('#import').addEventListener('click', () => {
  const source = document.querySelector('#import-data');
  const { values, ignored } = globalThis.CheckoutImport.parse(source.value);
  for (const [key, value] of Object.entries(values)) form.elements[key].value = value;
  CheckoutDates.apply(form);
  const count = Object.keys(values).length;
  source.value = '';
  show(count ? `${count} campos importados.${ignored ? ` ${ignored} linhas não reconhecidas ou de contato fixo foram ignoradas.` : ''} Confira os dados antes de preencher.` : 'Nenhum campo reconhecido. Use o formato Nome: valor, com uma informação por linha.', count ? 'success' : 'error');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  CheckoutDates.apply(form);
  const invalid = Array.from(form.elements).find(element => element.willValidate && !element.checkValidity());
  if (invalid) {
    const editor = invalid.closest('details');
    if (editor) editor.open = true;
    invalid.reportValidity();
    return;
  }
  const data = Object.fromEntries(new FormData(form));
  for (const key in data) data[key] = data[key].trim();
  if (!/^\d{11}$/.test(data.cpf.replace(/\D/g, ''))) return show('Confira o CPF: informe 11 dígitos.', 'error');
  if (!/^\d{13,19}$/.test(data.cardNumber.replace(/[ -]/g, ''))) return show('Confira o número do cartão.', 'error');
  if (!CheckoutDates.validExpiry(data.cardExpiry)) return show('Confira a validade: use MM/AA ou digite apenas os números.', 'error');
  if (!/^\d{3,4}$/.test(data.cardCvv)) return show('O CVV deve ter 3 ou 4 dígitos.', 'error');
  if (!CheckoutDates.validBirth(data.birthDate)) return show('Confira o nascimento: use uma data válida em dd/mm/aaaa ou digite apenas os números.', 'error');
  fillButton.disabled = true;
  show('Preenchendo os campos disponíveis…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('unsupported');
    const host = new URL(tab.url).hostname;
    if (!(host === 'meaple.com.br' || host.endsWith('.meaple.com.br') || ['127.0.0.1', 'localhost'].includes(host))) {
      show('Abra o checkout da Meaple. O preenchimento só é permitido nesse site ou na demonstração local.', 'error');
      return;
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/dates.js', 'src/fill.js'] });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (values) => globalThis.CheckoutAssist.fillCheckout(values),
      args: [data]
    });
    const result = results[0]?.result;
    if (!result) throw new Error('empty');
    show(`${result.filled.length} itens preenchidos. ${result.pending.length ? 'Confira as pendências abaixo.' : 'Revise no site antes de finalizar.'}`, result.pending.length ? '' : 'success');
    for (const item of result.pending) {
      const li = document.createElement('li');
      li.textContent = item;
      details.append(li);
    }
    // Saved cards remain encrypted in the vault; remove current form values after use.
    for (const name of sensitiveNames) form.elements[name].value = '';
  } catch {
    show('Não foi possível preencher. Abra o checkout em uma página normal do site e tente novamente.', 'error');
  } finally {
    for (const key in data) data[key] = '';
    fillButton.disabled = false;
  }
});
