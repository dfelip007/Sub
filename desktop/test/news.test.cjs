'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('../../node_modules/jsdom');
const { News, ACCOUNTS, newsUrl, INTERVAL_MS } = require('../app/news.cjs');
const { readInstagram } = require('../app/news-reader.cjs');
const user = ACCOUNTS[0];
const item = (id, kind = 'post') => ({ key: `${kind === 'post' ? 'p' : kind}:${id}`, kind, url: newsUrl(user, kind, id) });
const page = content => `<main><header><h2>${user}</h2></header>${content}</main>`;
function read(html, pathname = `/${user}/`) {
  const dom = new JSDOM(html, { url: `https://www.instagram.com${pathname}` });
  try { return readInstagram(dom.window.document, user); } finally { dom.window.close(); }
}
async function fixture(action) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'submundo-news-'));
  try { await action(new News(directory), directory); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
}
test('lê somente links visíveis de posts/reels no perfil correto e não alerta story genérico', () => {
  const result = read(page('<article><a href="/p/FIRST/">Post</a><a href="/p/FIRST/">Duplicado</a><a href="/reel/VIDEO/">Reel</a><a href="https://evil.invalid/p/EVIL/">Não</a><a hidden href="/p/HIDDEN/">Não</a></article><a href="/stories/festivalsubmundo808/">Stories</a>'));
  assert.equal(result.status, 'ok'); assert.equal(result.story, 'unknown');
  assert.deepEqual(result.items, [item('FIRST'), item('VIDEO', 'reel')]);
});
test('story só vira item quando há ID específico do perfil solicitado', () => {
  const result = read(page('<article><a href="/p/FIRST/">Post</a></article><a href="/stories/festivalsubmundo808/123456/">Story</a><a href="/stories/other/999/">Outro</a>'));
  assert.equal(result.story, 'identified'); assert.deepEqual(result.items[1], item('123456', 'story'));
});
test('login, perfil privado, página incompleta ou outro perfil nunca viram ausência de novidades', () => {
  assert.equal(read('<input type="password">', '/accounts/login/').status, 'login');
  assert.equal(read(page('<p>Esta conta é privada</p><a href="/p/OLD/">Antigo</a>')).status, 'unavailable');
  assert.equal(read(page('')).status, 'unavailable');
  assert.equal(read(page('<a href="/p/OTHER/">Outro</a>'), '/other/').status, 'outside');
  assert.equal(read('<main><h2>other</h2><a href="/p/OTHER/">Outro</a></main>').status, 'unavailable');
  assert.deepEqual(read(page('<p>0 publicações</p>')), { status: 'ok', items: [], story: 'unknown' });
});
test('primeira leitura cria referência; depois só itens desconhecidos geram aviso e persistem', () => fixture(async (news, directory) => {
  assert.equal((await news.state()).enabled, false); assert.equal(INTERVAL_MS, 300000);
  await news.apply(user, { status: 'ok', items: [item('FIRST')], story: 'unknown' }, 1000);
  assert.equal((await news.state()).profiles[0].unread, 0);
  await news.apply(user, { status: 'ok', items: [item('NEW'), item('FIRST'), item('123', 'story')], story: 'identified' }, 2000);
  let profile = (await news.state()).profiles[0]; assert.equal(profile.unread, 2); assert.equal(profile.items.length, 3);
  await news.apply(user, { status: 'ok', items: [item('NEW'), item('FIRST'), item('123', 'story')], story: 'identified' }, 3000);
  profile = (await new News(directory).state()).profiles[0]; assert.equal(profile.unread, 2); assert.equal(profile.items.find(value => value.key === 'p:NEW').detectedAt, 2000);
  await news.markItemRead(user, 'p:NEW'); assert.equal((await news.state()).profiles[0].unread, 1);
  await news.markRead(); assert.equal((await new News(directory).state()).profiles[0].unread, 0);
  await news.configure(true); assert.equal((await new News(directory).state()).enabled, true);
}));
test('falha/login mantém última leitura confirmada e conteúdo, com nova tentativa indicada', () => fixture(async news => {
  await news.apply(user, { status: 'ok', items: [item('FIRST')], story: 'identified' }, 1000);
  await news.apply(user, { status: 'login' }, 2000);
  const profile = (await news.state()).profiles[0];
  assert.equal(profile.lastSuccess, 1000); assert.equal(profile.lastAttempt, 2000); assert.equal(profile.status, 'login'); assert.equal(profile.story, 'unknown'); assert.equal(profile.items.length, 1);
  assert.equal((await news.state()).profiles[1].lastSuccess, null);
}));
test('links e itens arbitrários são recusados; arquivo corrompido é preservado', () => fixture(async (news, directory) => {
  assert.throws(() => newsUrl('other'), /não permitido/);
  assert.throws(() => newsUrl(user, 'file', 'x'), /inválido/);
  assert.throws(() => news.apply(user, { status: 'ok', items: [{ ...item('X'), url: 'javascript:alert(1)' }] }), /inválido/);
  await fs.writeFile(path.join(directory, 'news.json'), '{corrompido');
  await assert.rejects(news.state(), /preservado/); await assert.rejects(news.configure(true), /preservado/);
  assert.equal(await fs.readFile(path.join(directory, 'news.json'), 'utf8'), '{corrompido');
}));
