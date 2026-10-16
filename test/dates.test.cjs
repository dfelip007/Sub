const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const source = readFileSync(require.resolve('../src/dates.js'), 'utf8');
function setup() {
  const dom = new JSDOM('<input id="birth"><input id="expiry">', { runScripts: 'outside-only' });
  dom.window.eval(source);
  return dom;
}
test('normaliza datas digitadas, coladas e importadas sem barras e com ano completo', () => {
  const dom = setup();
  const dates = dom.window.CheckoutDates;
  for (const input of ['01021990', '01/02/1990', '1/2/1990', '1990-02-01']) assert.equal(dates.birth(input), '01/02/1990');
  for (const input of ['1230', '122030', '12/30', '12/2030']) assert.equal(dates.expiry(input), '12/30');
  assert.equal(dates.validBirth('31022000'), false);
  assert.equal(dates.validBirth('29022000'), true);
  assert.equal(dates.validBirth('29022001'), false);
  assert.equal(dates.validBirth('01022999'), false);
  for (const invalid of ['1330', '0030', '12345', '12/3', '1234567']) assert.equal(dates.validExpiry(invalid), false);
  dom.window.close();
});
test('insere barras durante digitação, permite apagar e reduz ano de validade no blur', () => {
  const dom = setup();
  const { document, CheckoutDates } = dom.window;
  const birth = document.querySelector('#birth');
  CheckoutDates.bind(birth, 'birth');
  for (const digit of '01021990') {
    birth.value += digit;
    birth.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: digit }));
  }
  assert.equal(birth.value, '01/02/1990');
  birth.setSelectionRange(3, 3);
  birth.dispatchEvent(new dom.window.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' }));
  assert.equal(birth.value.replace(/\D/g, ''), '0021990');
  const expiry = document.querySelector('#expiry');
  CheckoutDates.bind(expiry, 'expiry');
  expiry.value = '122030';
  expiry.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(expiry.value, '12/2030');
  expiry.dispatchEvent(new dom.window.Event('blur'));
  assert.equal(expiry.value, '12/30');
  dom.window.close();
});
