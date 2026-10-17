'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const rootFiles = new Set(['.gitignore', 'AGENTS.md', 'COMECE-AQUI.md', 'README.md', 'package.json', 'package-lock.json', 'manifest.json', 'desktop/package.json', 'desktop/package-lock.json', 'desktop/README.md']);
const roots = ['src/', 'demo/', 'test/', 'scripts/', 'docs/', 'desktop/app/', 'desktop/scripts/', 'desktop/test/', '.github/workflows/'];
const forbidden = new Set(['.git', 'node_modules', 'dist', 'test-results', '.smoke-data', 'userData', 'Partitions', 'Sessions', 'Local Storage', 'IndexedDB', 'Cache', 'Cookies', 'Login Data', 'profiles.json', 'workspace.json', 'news.json']);
const metadata = new Set(['ENTREGA.json', 'INTEGRIDADE-SHA256.json']);
const extensions = new Set(['.js', '.cjs', '.json', '.md', '.css', '.html', '.png', '.gz', '.ps1', '.py', '.yml', '.yaml']);
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
function git(root, args) { return execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }

function permitted(name) {
  const parts = name.split('/');
  return !name.includes('\\') && !/[\x00-\x1f]/.test(name) && !parts.some(part => !part || part === '.' || part === '..' || forbidden.has(part) || part.startsWith('.env'))
    && !name.startsWith('desktop/app/ui/') && (rootFiles.has(name) || roots.some(prefix => name.startsWith(prefix)) && extensions.has(path.posix.extname(name)));
}

function readSource(root) {
  if (git(root, ['status', '--porcelain', '--untracked-files=no']).toString('utf8').trim()) throw new Error('Faça commit das alterações rastreadas antes de gerar a entrega. Nenhum dado local será exportado.');
  const commit = git(root, ['rev-parse', 'HEAD']).toString('ascii').trim();
  const sources = [];
  for (const record of git(root, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD']).toString('utf8').split('\0').filter(Boolean)) {
    const separator = record.indexOf('\t');
    const [mode, type] = record.slice(0, separator).split(' ');
    const name = record.slice(separator + 1);
    if (metadata.has(name)) continue; // Regenerate provenance if this was imported from another delivery.
    if (!['100644', '100755'].includes(mode) || type !== 'blob' || !permitted(name)) throw new Error(`Revise o arquivo antes de exportar: ${name}. Dados locais, links e caminhos desconhecidos não são permitidos.`);
    sources.push({ name, content: git(root, ['show', `HEAD:${name}`]) });
  }
  for (const required of ['AGENTS.md', 'COMECE-AQUI.md', 'package.json', 'package-lock.json', 'desktop/package.json', 'desktop/package-lock.json', 'desktop/app/main.cjs', 'docs/ARQUITETURA.md', 'docs/DESENVOLVIMENTO.md', 'docs/REQUISITOS-E-DECISOES.md']) {
    if (!sources.some(file => file.name === required)) throw new Error(`Arquivo essencial ausente na revisão: ${required}`);
  }
  return { commit, sources };
}

async function write(root, name, content) {
  const target = path.join(root, ...name.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}
async function integrity(root, files) {
  const manifest = Object.fromEntries(files.map(file => [file.name, { sha256: digest(file.content), bytes: file.content.length }]));
  await write(root, 'INTEGRIDADE-SHA256.json', JSON.stringify({ algorithm: 'SHA256', files: manifest }, null, 2) + '\n');
}

async function packageProject({ root = path.resolve(__dirname, '..'), sourceOnly = false } = {}) {
  const { commit, sources } = readSource(root);
  const app = JSON.parse(sources.find(file => file.name === 'desktop/package.json').content);
  const extension = JSON.parse(sources.find(file => file.name === 'package.json').content);
  const source = path.join(root, 'desktop/dist/source');
  const provenance = Buffer.from(JSON.stringify({ format: 1, product: app.productName, desktopVersion: app.version, extensionVersion: extension.version, commit, createdAt: new Date().toISOString(), buildUrl: process.env.GITHUB_ACTIONS === 'true' ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null, personalDataIncluded: false, entry: 'COMECE-AQUI.md', sourceFiles: sources.length }, null, 2) + '\n');
  const files = [...sources, { name: 'ENTREGA.json', content: provenance }];
  await fs.rm(source, { recursive: true, force: true });
  for (const file of files) await write(source, file.name, file.content);
  await integrity(source, files);
  if (sourceOnly) return { commit, sourceFiles: sources.length, source };

  const executable = `Submundo-Compras-${app.version}-Windows-x64.exe`;
  const share = path.join(root, 'desktop/dist/share');
  const expected = [executable, `${executable}.sha256`, 'LEIA-ME.txt'].sort();
  const actual = (await fs.readdir(share)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('O diretório do executável precisa conter somente EXE, SHA256 e LEIA-ME verificados por share.cjs.');
  const binaries = [];
  for (const name of expected) {
    if (!(await fs.lstat(path.join(share, name))).isFile()) throw new Error('Links e diretórios não são permitidos na distribuição do executável.');
    binaries.push({ name: `executavel/${name}`, content: await fs.readFile(path.join(share, name)) });
  }
  const binary = binaries.find(file => file.name.endsWith('.exe'));
  const hash = binaries.find(file => file.name.endsWith('.sha256')).content.toString('ascii').trim();
  if (binary.content.subarray(0, 2).toString('ascii') !== 'MZ' || hash !== `${digest(binary.content)}  ${executable}`) throw new Error('Executável e checksum não conferem. Gere e confira novamente o pacote Windows.');
  const complete = path.join(root, 'desktop/dist/project');
  const instructions = Buffer.from(`SUBMUNDO COMPRAS ${app.version} — ENTREGA COMPLETA\n\nPara usar: extraia tudo e execute executavel/${executable}.\nPara analisar/modificar com Codex: abra projeto/COMECE-AQUI.md e projeto/AGENTS.md.\nCódigo, documentação, testes, lockfiles, workflow e logo estão em projeto/.\nCommit da entrega: ${commit}\nO EXE desta compilação acompanha os mesmos fontes identificados em projeto/ENTREGA.json.\nDados pessoais e sessões do remetente não acompanham a entrega. Cada usuário cadastra seus próprios dados.\nO pacote não contém dependências instaladas nem histórico Git. Instruções completas em projeto/docs/.\n`, 'utf8');
  const sourceIntegrity = await fs.readFile(path.join(source, 'INTEGRIDADE-SHA256.json'));
  const all = [...files.map(file => ({ ...file, name: `projeto/${file.name}` })), { name: 'projeto/INTEGRIDADE-SHA256.json', content: sourceIntegrity }, ...binaries, { name: 'COMECE-AQUI.txt', content: instructions }];
  await fs.rm(complete, { recursive: true, force: true });
  for (const file of all) await write(complete, file.name, file.content);
  await integrity(complete, all);
  return { commit, sourceFiles: sources.length, source, complete };
}

module.exports = { packageProject, permitted, readSource };
if (require.main === module) {
  packageProject({ sourceOnly: process.argv.includes('--source-only') }).then(result => {
    console.log(`Entrega preparada: ${result.sourceFiles} fontes da revisão ${result.commit}; ${result.complete ? 'código e projeto com executável' : 'somente código'}. Nenhuma pasta de dados ou sessão é copiada.`);
  }).catch(error => {
    const message = String(error.message);
    console.error(process.env.GITHUB_ACTIONS ? `::error::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}` : message);
    process.exitCode = 1;
  });
}
