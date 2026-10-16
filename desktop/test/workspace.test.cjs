'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Workspace, partition } = require('../app/workspace.cjs');
async function fixture(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meaple-workspace-'));
  try { await run(new Workspace(directory), directory); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
}
test('cria 16 perfis, mantém a sessão anterior e persiste seleção e nomes', () => fixture(async (workspace, directory) => {
  const initial = await workspace.init();
  assert.equal(partition(initial.selected), 'persist:meaple-checkout');
  const created = await workspace.create('Compras', 15);
  assert.equal(created.profiles.length, 16);
  assert.equal(new Set(created.profiles.map(item => partition(item.id))).size, 16);
  const id = created.selected;
  await workspace.rename(id, 'Conta Daniel');
  const reopened = await new Workspace(directory).init();
  assert.equal(reopened.selected, id);
  assert.equal(reopened.profiles.find(item => item.id === id).label, 'Conta Daniel');
  await assert.rejects(workspace.create('../invalido', 51), /quantidade/);
  await assert.rejects(workspace.select('desconhecido'), /não encontrado/);
  await workspace.create('Mais', 50);
  await assert.rejects(workspace.create('Mais', 50), /limite/);
}));
test('mesmo CPF com e sem pontuação compartilha horário em todos os perfis após reiniciar', () => fixture(async (workspace, directory) => {
  const initial = await workspace.init();
  const other = await workspace.create('Outro');
  await workspace.markUsed('000.000.000-00', initial.selected);
  const [first] = await workspace.statuses(['00000000000']);
  assert.equal(first.status, 'used');
  assert.equal(first.profile, 'Perfil 1');
  assert.ok(Math.abs(Date.now() - first.at) < 5000);
  await workspace.markUsed('00000000000', other.selected);
  const [last] = await new Workspace(directory).statuses(['000.000.000-00']);
  assert.ok(last.at > first.at);
  assert.equal(last.profile, 'Outro');
  // Stale UI must not accidentally clear a newer use.
  await assert.rejects(workspace.release('00000000000', first), /mudou/);
  assert.equal((await workspace.statuses(['00000000000']))[0].at, last.at);
  const disk = await fs.readFile(workspace.filename, 'utf8');
  for (const value of ['00000000000', '000.000.000-00', 'cardNumber', 'cardCvv']) assert.equal(disk.includes(value), false);
  await workspace.release('00000000000', last);
  assert.deepEqual(await workspace.statuses(['00000000000']), [{ status: 'available' }]);
}));
test('excluir perfil e recriar cadastro nunca apaga a marcação do CPF', () => fixture(async workspace => {
  const initial = await workspace.init();
  await workspace.create('Outro');
  await workspace.markUsed('11111111111', initial.selected);
  await workspace.remove(initial.selected);
  assert.equal((await workspace.statuses(['11111111111']))[0].status, 'used');
  assert.equal((await workspace.statuses(['11111111111']))[0].profile, 'Perfil excluído');
  const current = await workspace.init();
  await assert.rejects(workspace.remove(current.selected), /pelo menos um/);
}));
test('gravações concorrentes não perdem marcas e arquivo danificado não é sobrescrito', () => fixture(async workspace => {
  const { selected } = await workspace.init();
  await Promise.all(['00000000000', '11111111111', '22222222222'].map(cpf => workspace.markUsed(cpf, selected)));
  assert.deepEqual((await workspace.statuses(['00000000000', '11111111111', '22222222222'])).map(item => item.status), ['used', 'used', 'used']);
  await assert.rejects(workspace.markUsed('invalido', selected), /CPF/);
  await fs.writeFile(workspace.filename, 'arquivo-danificado');
  await assert.rejects(workspace.init(), /preservado/);
  await assert.rejects(workspace.markUsed('00000000000', selected), /preservado/);
  assert.equal(await fs.readFile(workspace.filename, 'utf8'), 'arquivo-danificado');
}));

test('marca o perfil preenchido e persiste horário sem marcar perfis apenas selecionados ou CPF manual', () => fixture(async (workspace, directory) => {
  const initial = await workspace.init();
  await workspace.markUsed('00000000000', initial.selected);
  const other = await workspace.create('Outro');
  assert.ok(other.profiles.every(profile => profile.lastFilledAt === undefined));
  const used = await workspace.markProfileFilled(initial.selected);
  const at = used.profiles.find(profile => profile.id === initial.selected).lastFilledAt;
  assert.ok(Math.abs(at - Date.now()) < 5000);
  assert.equal(used.selected, other.selected);
  assert.equal(used.profiles.find(profile => profile.id === other.selected).lastFilledAt, undefined);
  await workspace.rename(initial.selected, 'Perfil preenchido');
  const restored = await new Workspace(directory).init();
  assert.equal(restored.profiles.find(profile => profile.id === initial.selected).lastFilledAt, at);
  const [cpf] = await workspace.statuses(['00000000000']);
  await workspace.release('00000000000', cpf);
  assert.equal((await workspace.init()).profiles.find(profile => profile.id === initial.selected).lastFilledAt, at);
}));

test('limpar marcação exige horário atual e não altera CPF nem os outros perfis', () => fixture(async workspace => {
  const initial = await workspace.init(), other = await workspace.create('Outro');
  await workspace.markUsed('00000000000', initial.selected);
  const first = await workspace.markProfileFilled(initial.selected);
  const at = first.profiles.find(profile => profile.id === initial.selected).lastFilledAt;
  await workspace.markProfileFilled(other.selected);
  const newer = await workspace.markProfileFilled(initial.selected);
  const latest = newer.profiles.find(profile => profile.id === initial.selected).lastFilledAt;
  assert.ok(latest > at);
  await assert.rejects(workspace.clearProfileUse(initial.selected, at), /mudou/);
  await assert.rejects(workspace.markProfileFilled('inexistente'), /não encontrado/);
  const cleared = await workspace.clearProfileUse(initial.selected, latest);
  assert.equal(cleared.profiles.find(profile => profile.id === initial.selected).lastFilledAt, undefined);
  assert.ok(cleared.profiles.find(profile => profile.id === other.selected).lastFilledAt);
  assert.equal((await workspace.statuses(['00000000000']))[0].status, 'used');
}));

test('recusa horário de perfil inválido sem apagar o arquivo nem inventar uma marcação', () => fixture(async workspace => {
  await workspace.init();
  const content = JSON.parse(await fs.readFile(workspace.filename, 'utf8'));
  content.profiles[0].lastFilledAt = 'ontem';
  const damaged = JSON.stringify(content);
  await fs.writeFile(workspace.filename, damaged);
  await assert.rejects(workspace.markProfileFilled(content.selected), /preservado/);
  await assert.rejects(workspace.init(), /preservado/);
  assert.equal(await fs.readFile(workspace.filename, 'utf8'), damaged);
}));

test('preferências de filtros e som persistem sem alterar seleção, CPF ou marcas dos perfis', () => fixture(async (workspace, directory) => {
  const initial = await workspace.init(); assert.equal(initial.monitor.sound, false);
  await workspace.markUsed('00000000000', initial.selected);
  await workspace.markProfileFilled(initial.selected);
  const saved = await workspace.configureMonitor({ sound: true, status: 'available', usage: 'unused', search: 'Perfil', sort: 'profile' });
  assert.equal(saved.selected, initial.selected); assert.ok(saved.profiles[0].lastFilledAt);
  const reopened = await new Workspace(directory).init(); assert.deepEqual(reopened.monitor, saved.monitor);
  await assert.rejects(workspace.configureMonitor({ sound: 'sim' }), /inválidas/);
  assert.deepEqual((await workspace.init()).monitor, saved.monitor);
  assert.equal((await workspace.statuses(['00000000000']))[0].status, 'used');
}));
