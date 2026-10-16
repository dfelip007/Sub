const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const engine = readFileSync(require.resolve('../src/fill.js'), 'utf8');
const fixture = readFileSync(require.resolve('../demo/checkout.html'), 'utf8');
// Fictitious fixtures only. No real personal or payment information.
const data = {
  buyerName: 'Pessoa de Teste', cpf: '00000000000', email: 'teste@example.invalid',
  phone: '11900000000', birthDate: '01/02/1990', cardNumber: '0000000000000000',
  cardHolder: 'PESSOA DE TESTE', cardExpiry: '12/30', cardCvv: '000',
  country: 'Brasil', postalCode: '00000000', city: 'Cidade Teste', state: 'SP',
  street: 'Rua de Teste', streetNumber: '123', installments: '1'
};
function setup(html = fixture) {
  const dom = new JSDOM(html, { url: 'https://meaple.com.br/checkout/test', runScripts: 'outside-only' });
  dom.window.eval(readFileSync(require.resolve('../src/dates.js'), 'utf8'));
  dom.window.eval(engine);
  return dom;
}
test('preenche todos os campos dos prints, recusa seguro e não finaliza a compra', async () => {
  const dom = setup();
  const doc = dom.window.document;
  let submissions = 0;
  let finishClicks = 0;
  let inputEvents = 0;
  doc.querySelector('form').addEventListener('submit', event => { event.preventDefault(); submissions++; });
  doc.querySelector('#finish').addEventListener('click', () => finishClicks++);
  doc.addEventListener('input', () => inputEvents++);
  const result = await dom.window.CheckoutAssist.fillCheckout(data);
  assert.equal(result.pending.length, 0, JSON.stringify(result.pending));
  assert.equal(result.filled.length, 17);
  const inputs = [...doc.querySelectorAll('input:not([type=radio])')];
  assert.deepEqual(inputs.map(input => input.value), [data.buyerName, data.cpf, data.email, data.phone, data.birthDate, data.cardNumber, data.cardHolder, data.cardExpiry, data.cardCvv, data.postalCode, data.city, data.street, data.streetNumber]);
  assert.deepEqual([...doc.querySelectorAll('select')].map(select => select.value), ['1', 'BR', 'SP']);
  assert.equal(doc.querySelector('input[value=no]').checked, true);
  assert.equal(submissions, 0);
  assert.equal(finishClicks, 0);
  assert.equal(inputEvents, 17); // 16 fields plus the insurance radio.
  dom.window.close();
});
test('segunda compra substitui os dados, mantendo os contatos fornecidos', async () => {
  const dom = setup();
  await dom.window.CheckoutAssist.fillCheckout(data);
  const second = { ...data, buyerName: 'Outra Pessoa', cardNumber: '1111111111111111', cardCvv: '123', state: 'RJ', installments: '2' };
  const result = await dom.window.CheckoutAssist.fillCheckout(second);
  assert.equal(result.pending.length, 0);
  assert.equal(dom.window.document.querySelector('input[placeholder="Nome Completo"]').value, second.buyerName);
  assert.equal(dom.window.document.querySelector('input[placeholder="CVV"]').value, '123');
  assert.equal(dom.window.document.querySelector('input[type=email]').value, data.email);
  assert.equal(dom.window.localStorage.length, 0);
  dom.window.close();
});
test('não escolhe entre dois campos ambíguos nem altera um campo oculto', async () => {
  const dom = setup(fixture.replace('<label>CPF *', '<label>CPF<input></label><label>CPF *').replace('</form>', '<label hidden>Nome Completo<input value="não alterar"></label></form>'));
  const result = await dom.window.CheckoutAssist.fillCheckout(data);
  assert.ok(result.pending.some(item => item.startsWith('CPF: mais de um')));
  assert.equal(dom.window.document.querySelector('[hidden] input').value, 'não alterar');
  assert.equal(dom.window.document.querySelector('input[placeholder="Digite o CPF..."]').value, '');
  dom.window.close();
});
test('reporta campos ausentes, iframe e parcelas sem selecionar opção silenciosamente', async () => {
  const dom = setup('<iframe title="pagamento"></iframe>');
  const result = await dom.window.CheckoutAssist.fillCheckout({ ...data, installments: '' });
  assert.equal(result.filled.length, 0);
  assert.ok(result.pending.some(item => item.startsWith('Número do cartão: campo não encontrado')));
  assert.ok(result.pending.some(item => item.includes('iframe')));
  assert.ok(result.pending.some(item => item.startsWith('Seguro:')));
  assert.ok(result.pending.some(item => item.startsWith('Parcelas: confira')));
  dom.window.close();
});
test('aguarda opções de parcelas criadas após a entrada do cartão', async () => {
  const dom = setup();
  const doc = dom.window.document;
  const select = doc.querySelector('select');
  select.replaceChildren();
  doc.querySelector('input[placeholder="1234 1234 1234 1234"]').addEventListener('input', () => {
    dom.window.setTimeout(() => { select.innerHTML = '<option value="">Selecione</option><option value="single">1x de R$ 100,00</option>'; }, 180);
  });
  const result = await dom.window.CheckoutAssist.fillCheckout(data);
  assert.equal(result.pending.length, 0);
  assert.equal(select.value, 'single');
  dom.window.close();
});
test('preenche data nativa e seleciona estado pelo nome completo', async () => {
  const dom = setup(fixture.replace('placeholder="dd/mm/aaaa"', 'type="date" placeholder="dd/mm/aaaa"').replace('value="SP"', 'value="35"'));
  const result = await dom.window.CheckoutAssist.fillCheckout(data);
  assert.equal(result.pending.length, 0);
  assert.equal(dom.window.document.querySelector('input[type=date]').value, '1990-02-01');
  assert.equal(dom.window.document.querySelectorAll('select')[2].value, '35');
  dom.window.close();
});
test('bloqueia envio incidental de formulário durante a seleção do cartão', async () => {
  const dom = setup(fixture.replace('type="button" id="credit"', 'type="submit" formnovalidate id="credit"'));
  let submissions = 0;
  dom.window.document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); submissions++; });
  const result = await dom.window.CheckoutAssist.fillCheckout(data);
  assert.equal(result.pending.length, 0);
  assert.equal(submissions, 0);
  // The temporary guard must be removed so the user can still submit manually.
  dom.window.document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(submissions, 1);
  dom.window.close();
});
test('envia nascimento e validade com as barras mesmo recebendo apenas números', async () => {
  const dom = setup();
  const result = await dom.window.CheckoutAssist.fillCheckout({ ...data, birthDate: '01021990', cardExpiry: '122030' });
  assert.equal(result.pending.length, 0);
  assert.equal(dom.window.document.querySelector('input[placeholder="dd/mm/aaaa"]').value, '01/02/1990');
  assert.equal(dom.window.document.querySelector('input[placeholder="MM/AA"]').value, '12/30');
  dom.window.close();
});
test('adapta validade a campo nativo de mês e campo com ano completo', async () => {
  for (const [replacement, expected] of [['type="month" placeholder="MM/AA"', '2030-12'], ['placeholder="MM/AAAA"', '12/2030']]) {
    const dom = setup(fixture.replace('placeholder="MM/AA"', replacement));
    const result = await dom.window.CheckoutAssist.fillCheckout({ ...data, cardExpiry: '1230' });
    assert.equal(result.pending.length, 0);
    assert.equal(dom.window.document.querySelector('input[placeholder^="MM/"]').value, expected);
    dom.window.close();
  }
});
