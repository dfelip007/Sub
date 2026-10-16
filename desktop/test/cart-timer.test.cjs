'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('../../node_modules/jsdom');
const { readCartTimer, freshTimer } = require('../app/cart-timer.cjs');

function read(html, route = '/checkout') {
  const dom = new JSDOM(html, { url: `https://meaple.com.br${route}` });
  try { return readCartTimer(dom.window.document); } finally { dom.window.close(); }
}
test('lê o prazo visível do carrinho em relógio, spans separados e duração em português', () => {
  for (const [html, seconds] of [
    ['<p>Seu carrinho expira em <strong>09:58</strong></p>', 598],
    ['<aside><p>Tempo restante para finalizar a compra</p><span>02</span><b>:</b><span>03</span></aside>', 123],
    ['<div>Você tem 01:02:03 para concluir sua compra</div>', 3723],
    ['<p>Sua reserva expira em 2 minutos e 15 segundos</p>', 135],
    ['<p>Tempo restante: 59 segundos</p>', 59],
    ['<p>Tempo disponível: 1 minuto</p>', 60],
    ['<div><h2>Dados do Comprador</h2><p>Tempo restante: 10:00</p></div>', 600]
  ]) assert.deepEqual(read(html), { status: 'running', seconds }, html);
  assert.deepEqual(read('<p>Sua reserva expira em 09:58</p>', '/pedido/123'), { status: 'running', seconds: 598 });
});
test('contador genérico só é aceito em checkout e não confunde evento, preço ou nascimento', () => {
  assert.deepEqual(read('<p>Tempo restante: 01:59</p>'), { status: 'running', seconds: 119 });
  for (const html of [
    '<p>Tempo restante: 01:59</p>',
    '<h2>Dados do Comprador</h2><p>Início do evento: 20:30</p>',
    '<h2>Dados do Comprador</h2><section><h3>Início do evento</h3><p>Tempo restante: 12:30</p></section>',
    '<h2>Dados do Comprador</h2><p>Próximo lote: tempo restante 05:00</p>',
    '<h2>Dados do Comprador</h2><label>Nascimento<input value="01/02/1990"></label><p>Total R$ 120,00</p>',
    '<script>const remaining = "tempo restante: 10:00";</script><input value="Tempo restante: 10:00">'
  ]) assert.equal(read(html, '/evento/submundo'), null, html);
});
test('ignora relógios ocultos, valores inválidos e contadores conflitantes', () => {
  for (const html of [
    '<p hidden>Tempo restante: 10:00</p>',
    '<div style="display:none"><p>Tempo restante: 10:00</p></div>',
    '<div aria-hidden="true"><p>Tempo restante: 10:00</p></div>',
    '<p style="opacity:0">Tempo restante: 10:00</p>',
    '<p>Tempo restante: 10:99</p>',
    '<p>Tempo restante: 10:00:99</p>',
    '<section><p>Carrinho expira em 10:00</p></section><section><p>Tempo restante: 09:00</p></section>'
  ]) assert.equal(read(html), null, html);
  assert.deepEqual(read('<p>Tempo restante: <span hidden>10:00</span><span>02:00</span></p>'), { status: 'running', seconds: 120 });
  assert.deepEqual(read('<p>Tempo restante: 10:00</p><p hidden>Tempo restante: 09:00</p>'), { status: 'running', seconds: 600 });
});
test('contador zerado e mensagem de expiração são identificados sem prazo inventado', () => {
  for (const html of ['<p>Tempo restante: 00:00</p>', '<div>Seu carrinho expirou</div><p>Carrinho expirado</p>', '<p>Sua reserva está expirada</p>']) {
    assert.deepEqual(read(html), { status: 'expired', seconds: 0 });
  }
  assert.equal(read('<h2>Dados do Comprador</h2>'), null);
  assert.equal(read('<p>Tempo restante indisponível</p>'), null);
});
test('releitura acompanha mudanças e remoção do contador, sem decrementar por conta própria', () => {
  const dom = new JSDOM('<p>Tempo restante: <b>03:00</b></p>', { url: 'https://meaple.com.br/checkout' });
  try {
    assert.equal(readCartTimer(dom.window.document).seconds, 180);
    dom.window.document.querySelector('b').textContent = '01:20';
    assert.equal(readCartTimer(dom.window.document).seconds, 80);
    dom.window.document.querySelector('p').remove();
    assert.equal(readCartTimer(dom.window.document), null);
  } finally { dom.window.close(); }
});
test('leituras com mais de cinco segundos ou erro deixam de ser exibidas', () => {
  const entry = { timer: { status: 'running', seconds: 600 }, timerReadAt: 1000, error: '' };
  assert.deepEqual(freshTimer(entry, 5999), entry.timer);
  assert.equal(freshTimer(entry, 6000), null);
  assert.equal(freshTimer({ ...entry, error: 'falha' }, 2000), null);
});
