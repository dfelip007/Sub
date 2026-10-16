const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canFill, canNavigate, validateValues } = require('../app/policy.cjs');
test('preenchimento aceita somente HTTPS da Meaple e não libera hosts parecidos', () => {
  for (const url of ['https://meaple.com.br/checkout', 'https://www.meaple.com.br/checkout', 'https://tickets.meaple.com.br/']) assert.equal(canFill(url), true);
  for (const url of ['https://evilmeaple.com.br/', 'https://meaple.com.br.evil.invalid/', 'https://meaple.com.br@evil.invalid/', 'http://meaple.com.br/', 'file:///tmp/site.html', 'javascript:alert(1)', 'app://manager/popup.html', 'http://127.0.0.1:8080/']) assert.equal(canFill(url), false, url);
  assert.equal(canFill('http://127.0.0.1:8080/checkout.html', true), true);
  assert.equal(canFill('http://127.0.0.1:8081/checkout.html', true), false);
});
test('navegação admite provedores HTTPS e bloqueia protocolos locais/executáveis', () => {
  assert.equal(canNavigate('https://pagamento.example.invalid/3ds'), true);
  assert.equal(canNavigate('about:blank'), true);
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'app://manager/popup.html', 'http://meaple.com.br']) assert.equal(canNavigate(url), false);
});
test('dados são tratados como texto e campos inesperados são recusados', () => {
  const data = { buyerName: "'; throw new Error('nao executar'); //", cardCvv: '000' };
  assert.deepEqual(validateValues(data), data);
  assert.throws(() => validateValues({ execute: 'malicious()' }), /Campo/);
  assert.throws(() => validateValues({ buyerName: 'x'.repeat(501) }), /Campo/);
  assert.throws(() => validateValues({ buyerName: 123 }), /Campo/);
  assert.throws(() => validateValues([]), /Dados/);
});
