const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canFill, canNavigate, validateValues, eventUrl } = require('../app/policy.cjs');
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
test('abertura em todos os perfis aceita somente links válidos da Meaple sem credenciais', () => {
  assert.equal(eventUrl('  https://MEAPLE.com.br/evento/submundo?lote=2#ingressos  '), 'https://meaple.com.br/evento/submundo?lote=2#ingressos');
  assert.equal(eventUrl('https://www.meaple.com.br/evento'), 'https://www.meaple.com.br/evento');
  for (const value of ['', null, {}, 'meaple.com.br/evento', 'https://meaple.com.br.evil.invalid/evento', 'https://evilmeaple.com.br/evento', 'http://meaple.com.br/evento', 'https://user:secret@meaple.com.br/evento', 'https://meaple.com.br:8443/evento', 'file:///tmp/evento', 'javascript:alert(1)', 'https://meaple.com.br/a\nb', 'https://meaple.com.br/' + 'x'.repeat(2048), 'http://127.0.0.1:8080/evento']) assert.throws(() => eventUrl(value), /link HTTPS da Meaple/);
  assert.equal(eventUrl('http://127.0.0.1:8080/evento', true), 'http://127.0.0.1:8080/evento');
});
