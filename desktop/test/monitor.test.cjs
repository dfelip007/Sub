'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { settings, tabs, profiles, AlertTracker } = require('../app/monitor.js');
function fixture() {
  return { profileId: 'a', tab: { id: 1 }, profiles: [{ id: 'a', label: 'João', lastFilledAt: 123 }, { id: 'b', label: 'Maria' }, { id: 'c', label: 'Sem janela' }], tabs: [
    { id: 1, profileId: 'a', queue: 'waiting', url: 'https://meaple.com.br/808/evento' },
    { id: 2, profileId: 'a', queue: 'available', url: 'https://meaple.com.br/808/evento' },
    { id: 3, profileId: 'b', queue: 'checkout', url: 'https://meaple.com.br/orders/123', timer: { seconds: 90 } }
  ] };
}
test('combina status, utilização e busca sem confundir janelas do mesmo perfil ou mudar destino', () => {
  const state = fixture(), original = structuredClone(state);
  assert.deepEqual(tabs(state, settings({ status: 'available' })).map(tab => tab.id), [2]);
  assert.deepEqual(tabs(state, settings({ status: 'waiting', usage: 'used', search: 'JOAO' })).map(tab => tab.id), [1]);
  assert.deepEqual(profiles(state, settings({ status: 'available', usage: 'unused' })), []);
  assert.deepEqual(profiles(state, settings({ usage: 'unused', sort: 'profile' })).map(profile => profile.id), ['b', 'c']);
  assert.deepEqual(tabs(state, settings({ status: 'urgent' })).map(tab => tab.id), [3]);
  assert.deepEqual(tabs(state, settings({ search: 'inexistente' })), []);
  assert.deepEqual(state, original);
});
test('ordena os carrinhos correndo antes dos expirados e desconhecidos, preservando desempate estável', () => {
  const state = fixture();
  state.tabs[0].timer = { seconds: 0 }; state.tabs[1].timer = { seconds: 45 };
  assert.deepEqual(tabs(state, settings()).map(tab => tab.id), [2, 3, 1]);
  assert.deepEqual(tabs(state, settings({ sort: 'profile' })).map(tab => tab.id), [1, 2, 3]);
  assert.deepEqual(profiles(state, settings()).map(profile => profile.id), ['a', 'b', 'c']);
});
test('preferências aceitam somente valores conhecidos, com som inicialmente desligado', () => {
  assert.equal(settings().sound, false);
  for (const patch of [{ sound: 'sim' }, { status: 'comprar' }, { usage: 'x' }, { sort: 'aleatorio' }, { search: 'x'.repeat(81) }, { cardCvv: '000' }]) assert.throws(() => settings(patch), /inválidas/);
});
test('liberação alerta uma vez por evento/janela após espera, sem alerta por abrir um evento direto', () => {
  const tracker = new AlertTracker(() => 1000), state = fixture(); state.tabs[2].timer = null;
  assert.equal(tracker.update(state).length, 0);
  state.tabs[0].queue = 'loading'; assert.equal(tracker.update(state).length, 0);
  state.tabs[0].queue = 'available';
  const emitted = tracker.update(state); assert.equal(emitted.length, 1); assert.equal(emitted[0].kind, 'ready'); assert.equal(emitted[0].tabId, 1);
  assert.equal(tracker.update(state).length, 0);
  state.tabs[0].queue = 'waiting'; tracker.update(state); state.tabs[0].queue = 'available'; assert.equal(tracker.update(state).length, 0);
  tracker.clear(); assert.equal(tracker.recent.length, 0); assert.equal(tracker.update(state).length, 0);
  state.tabs[0].queue = 'waiting'; tracker.update(state); state.tabs[0].url = 'https://meaple.com.br/808/outro'; state.tabs[0].queue = 'available'; assert.equal(tracker.update(state).length, 1);
});
test('avisa ao chegar a dois minutos e deduplica o mesmo pedido/perfil entre janelas e fontes de tempo', () => {
  const tracker = new AlertTracker(), state = fixture(); state.tabs[2].timer = { seconds: 121 };
  assert.equal(tracker.update(state).length, 0);
  state.tabs[2].timer.seconds = 120;
  const first = tracker.update(state); assert.equal(first.length, 1); assert.equal(first[0].kind, 'urgent');
  state.tabs.push({ ...state.tabs[2], id: 4, url: 'https://meaple.com.br/orders/123/payment?step=1#card', timer: { seconds: 119, source: 'orders' } });
  assert.equal(tracker.update(state).length, 0);
  state.tabs[2].timer.seconds = 122; tracker.update(state); state.tabs[2].timer.seconds = 119; assert.equal(tracker.update(state).length, 0);
  state.tabs[2].url = 'https://meaple.com.br/orders/456'; assert.equal(tracker.update(state).length, 1);
  state.tabs[2].timer.seconds = 0; assert.equal(tracker.update(state).length, 0);
});
test('avisos não dependem de filtros nem de som; limpar não rearma e janelas fechadas saem do acompanhamento', () => {
  const tracker = new AlertTracker(), state = fixture(); state.monitor = settings({ sound: false, status: 'waiting', search: 'oculto' });
  assert.equal(tabs(state, state.monitor).length, 0);
  assert.equal(tracker.update(state).length, 1);
  assert.equal(tracker.recent[0].profile, 'Maria');
  state.monitor.sound = true; assert.equal(tracker.update(state).length, 0);
  tracker.clear(); assert.equal(tracker.update(state).length, 0);
  state.tabs = []; tracker.update(state); assert.equal(tracker.previous.size, 0);
});
