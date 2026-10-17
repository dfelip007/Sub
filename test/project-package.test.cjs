'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { packageProject, permitted } = require('../scripts/package-project.cjs');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sub-project-export-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  const files = {
    '.gitignore': 'node_modules/\ndesktop/dist/\n', 'AGENTS.md': 'Contexto fictício', 'COMECE-AQUI.md': 'Guia fictício',
    'package.json': '{"version":"0.2.0"}', 'package-lock.json': '{}', 'desktop/package.json': '{"version":"0.9.0","productName":"Submundo Compras"}', 'desktop/package-lock.json': '{}',
    'desktop/app/main.cjs': '// fixture', 'src/fill.js': '// fixture', '.github/workflows/windows-desktop.yml': 'name: fixture',
    'docs/ARQUITETURA.md': 'Fixture', 'docs/DESENVOLVIMENTO.md': 'Fixture', 'docs/REQUISITOS-E-DECISOES.md': 'Fixture'
  };
  for (const [name, text] of Object.entries(files)) { await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true }); await fs.writeFile(path.join(root, name), text); }
  git(root, 'add', '.'); git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture');
  return root;
}
test('exporta fontes e arquivos ocultos necessários com proveniência/hashes, sem dados não rastreados nem histórico Git', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'profiles.json'), 'PRIVATE FIXTURE');
  const result = await packageProject({ root, sourceOnly: true });
  assert.equal(await fs.readFile(path.join(result.source, '.github/workflows/windows-desktop.yml'), 'utf8'), 'name: fixture');
  const manifest = JSON.parse(await fs.readFile(path.join(result.source, 'INTEGRIDADE-SHA256.json')));
  assert.equal(manifest.files['AGENTS.md'].sha256, crypto.createHash('sha256').update('Contexto fictício').digest('hex'));
  const info = JSON.parse(await fs.readFile(path.join(result.source, 'ENTREGA.json')));
  assert.equal(info.commit, git(root, 'rev-parse', 'HEAD').toString().trim());
  assert.equal(info.personalDataIncluded, false);
  for (const name of ['profiles.json', '.git', 'node_modules']) await assert.rejects(fs.access(path.join(result.source, name)));
});
test('recusa mudanças sem commit, dados pessoais rastreados e diretórios gerados em vez de exportar pacote incompleto ou privado', async t => {
  const root = await fixture(t);
  await fs.appendFile(path.join(root, 'src/fill.js'), '\n// altered');
  await assert.rejects(packageProject({ root, sourceOnly: true }), /Faça commit/);
  git(root, 'restore', 'src/fill.js');
  await fs.writeFile(path.join(root, 'desktop/app/profiles.json'), 'PRIVATE FIXTURE');
  git(root, 'add', '.'); git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'private fixture');
  await assert.rejects(packageProject({ root, sourceOnly: true }), /Revise o arquivo/);
  for (const name of ['desktop/app/ui/popup.html', 'desktop/app/workspace.json', 'desktop/dist/app.exe', '.env', 'scripts/../profiles.json', 'docs/private.pem', '/src/fill.js']) assert.equal(permitted(name), false, name);
});
test('entrega completa reúne executável e fontes, verifica hashes e rejeita arquivos extras ou executável adulterado', async t => {
  const root = await fixture(t), share = path.join(root, 'desktop/dist/share');
  await fs.mkdir(share, { recursive: true });
  const name = 'Submundo-Compras-0.9.0-Windows-x64.exe', binary = Buffer.from('MZ packaging fixture, not an executable app');
  await fs.writeFile(path.join(share, name), binary);
  await fs.writeFile(path.join(share, `${name}.sha256`), `${crypto.createHash('sha256').update(binary).digest('hex')}  ${name}\n`);
  await fs.writeFile(path.join(share, 'LEIA-ME.txt'), 'Fixture');
  const result = await packageProject({ root });
  assert.deepEqual(await fs.readFile(path.join(result.complete, 'executavel', name)), binary);
  assert.match(await fs.readFile(path.join(result.complete, 'COMECE-AQUI.txt'), 'utf8'), /Codex/);
  const manifest = JSON.parse(await fs.readFile(path.join(result.complete, 'INTEGRIDADE-SHA256.json')));
  assert.ok(manifest.files['projeto/AGENTS.md']); assert.ok(manifest.files[`executavel/${name}`]);
  await fs.writeFile(path.join(share, 'profiles.json'), 'PRIVATE FIXTURE');
  await assert.rejects(packageProject({ root }), /somente EXE/);
  await fs.rm(path.join(share, 'profiles.json'));
  await fs.appendFile(path.join(share, name), 'changed');
  await assert.rejects(packageProject({ root }), /checksum/);
});
