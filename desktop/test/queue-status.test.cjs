'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('../../node_modules/jsdom');
const { readQueuePage, QueueStatus, EventRoutes } = require('../app/queue-status.cjs');
function read(html, route = '/808/submundo') {
  const dom = new JSDOM(html, { url: `https://meaple.com.br${route}` });
  try { return readQueuePage(dom.window.document); } finally { dom.window.close(); }
}
const waiting = '<title>SUBMUNDO 808 — Sala de espera - meaple.com.br/808/submundo</title><h1>Aguarde</h1>';
const event = '<title>SUBMUNDO 808 — Meaple</title><h1>SUBMUNDO 808</h1><button>Comprar ingressos</button>';
test('reconhece Sala de espera no título fornecido e em cabeçalho visível', () => {
  assert.equal(read(waiting).kind, 'waiting');
  assert.equal(read('<h1>Sala de espera</h1>').kind, 'waiting');
  assert.equal(read('<title>Waiting room</title>').kind, 'waiting');
  assert.equal(read('<h1 hidden>Sala de espera</h1><h2>Evento</h2>').kind, 'unknown');
});
test('sair do título de espera não basta: evento exige cabeçalho e ação de ingresso visíveis', () => {
  assert.equal(read(event).kind, 'event');
  assert.equal(read('<title>SUBMUNDO 808</title><h1>SUBMUNDO 808</h1>').kind, 'unknown');
  assert.equal(read('<h1>Evento</h1><button hidden>Comprar ingressos</button>').kind, 'unknown');
  assert.equal(read('<div style="display:none"><h1>Evento</h1><button>Comprar ingressos</button></div>').kind, 'unknown');
  assert.equal(read('<title>Página não encontrada</title><h1>Evento</h1><button>Comprar ingressos</button>').kind, 'error');
  assert.equal(read('<title>Evento</title><h1>Acesso negado</h1><button>Comprar ingressos</button>').kind, 'error');
});
test('só informa liberado após observar espera e reconhecer o mesmo evento', () => {
  const tracker = new QueueStatus(), url = 'https://meaple.com.br/evento/submundo';
  assert.equal(tracker.observe(read(event), url), 'event');
  assert.equal(tracker.observe(read(waiting), url), 'waiting');
  assert.equal(tracker.observe(read('<title>Meaple</title>'), url), 'unknown');
  assert.equal(tracker.observe(read(event), `${url}?step=1#ingressos`), 'released');
  assert.equal(tracker.observe(read(waiting), url), 'waiting');
  assert.equal(tracker.observe(read(event), 'https://meaple.com.br/evento/submundo'), 'released');
  const other = read('<title>Outro Festival</title><h1>Outro Festival</h1><button>Comprar ingressos</button>');
  assert.equal(tracker.observe(other, 'https://meaple.com.br/evento/outro'), 'event');
});
test('não libera erro, outra origem, URL com credenciais ou porta alternativa', () => {
  const tracker = new QueueStatus(), url = 'https://meaple.com.br/evento/submundo';
  tracker.observe(read(waiting), url);
  assert.equal(tracker.observe({ kind: 'error' }, url), 'error');
  for (const outside of ['https://provider.invalid/808/submundo', 'https://meaple.com.br.evil.invalid/808/submundo', 'http://meaple.com.br/808/submundo', 'https://user:pass@meaple.com.br/808/submundo', 'https://meaple.com.br:444/808/submundo']) assert.equal(tracker.observe(read(event), outside), 'outside');
});
test('cada janela mantém seu estado, volta para espera e reconhece checkout sem inventar liberação', () => {
  const a = new QueueStatus(), b = new QueueStatus(), url = 'https://meaple.com.br/evento/submundo';
  a.observe(read(waiting), url); b.observe(read(waiting), url);
  assert.equal(a.observe(read(event), url), 'released'); assert.equal(b.status, 'waiting');
  assert.equal(a.observe(read(waiting), url), 'waiting');
  assert.equal(read('<h1>Dados do Comprador</h1>', '/orders/123').kind, 'checkout');
  assert.equal(a.observe({ kind: 'checkout' }, 'https://meaple.com.br/orders/123'), 'checkout');
});

test('link do evento fornecido e rotas de organizador/evento ficam disponíveis sem depender de botão ou espera anterior', () => {
  const tracker = new QueueStatus(), events = new EventRoutes();
  const url = 'https://meaple.com.br/808/submundo-808-curitiba-pr';
  assert.equal(tracker.observe(read('<title>Submundo 808</title>'), url), 'available');
  assert.equal(tracker.observe({ kind: 'unknown' }, `${url}/?utm_source=instagram#ingressos`), 'available');
  assert.equal(events.has('https://meaple.com.br/909/outro-evento'), true);
  for (const value of ['https://meaple.com.br/', 'https://meaple.com.br/808/', 'https://meaple.com.br/orders/123', 'https://meaple.com.br/808/sala-de-espera', 'https://meaple.com.br/808/submundo-extra/pagamento', 'https://meaple.com.br.evil.invalid/808/submundo', 'http://meaple.com.br/808/submundo', 'https://user:pass@meaple.com.br/808/submundo', 'https://meaple.com.br:444/808/submundo']) {
    events.remember(value); assert.equal(events.has(value), false, value);
  }
});

test('link explicitamente informado é exato e compartilhado entre leitores; espera e erro têm prioridade', () => {
  const events = new EventRoutes(), a = new QueueStatus(false, events), b = new QueueStatus(false, events);
  const url = 'https://meaple.com.br/evento/submundo-curitiba';
  assert.equal(a.observe({ kind: 'unknown' }, url), 'unknown');
  events.remember(url);
  assert.equal(a.observe({ kind: 'unknown' }, `${url}/?source=site`), 'available');
  assert.equal(b.observe(read(waiting), url), 'waiting');
  assert.equal(a.status, 'available');
  assert.equal(b.observe({ kind: 'error' }, url), 'error');
  assert.equal(b.observe({ kind: 'unknown' }, url), 'available');
  assert.equal(b.observe({ kind: 'unknown' }, `${url}-outro`), 'unknown');
  assert.equal(b.observe({ kind: 'unknown' }, 'https://provider.invalid/evento/submundo-curitiba'), 'outside');
});
