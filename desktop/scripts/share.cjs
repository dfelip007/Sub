'use strict';
// Stage only the application and public instructions, never Electron userData.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');

async function main() {
  const root = path.resolve(__dirname, '..');
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const archive = path.join(root, 'dist/win-unpacked/resources/app.asar');
  const native = ['adapter.js', 'cart-timer.cjs', 'instagram.cjs', 'main.cjs', 'monitor.js', 'news.cjs', 'news-reader.cjs', 'panel.css', 'panel.html', 'policy.cjs', 'preload.cjs', 'queue-status.cjs', 'store.cjs', 'ticket-reader.cjs', 'tickets.js', 'wallet.js', 'workspace.cjs'];
  const ui = ['adapter.js', 'dates.js', 'fill.js', 'import.js', 'monitor.js', 'popup.css', 'popup.html', 'submundo.png', 'tickets.js', 'vault.js', 'wallet.js'];
  const expected = new Set([...native.map(name => `app/${name}`), ...ui.map(name => `app/ui/${name}`), 'app/assets/submundo.png', 'app/assets/README.md']);
  const remaining = new Set(expected);
  for (const entry of asar.listPackage(archive)) {
    const name = entry.replace(/^[/\\]/, '').replaceAll('\\', '/');
    const stat = asar.statFile(archive, name, false);
    if (stat.files) continue;
    if (stat.link || stat.unpacked) throw new Error(`Entrada inesperada no aplicativo: ${name}`);
    if (name === 'package.json') continue;
    if (!expected.has(name)) throw new Error(`Arquivo não autorizado no pacote: ${name}`);
    const source = await fs.readFile(path.join(root, name));
    if (!asar.extractFile(archive, name).equals(source)) throw new Error(`Arquivo do aplicativo diverge do código preparado: ${name}`);
    remaining.delete(name);
  }
  if (remaining.size) throw new Error(`Funcionalidades ausentes no pacote: ${[...remaining].join(', ')}`);
  const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
  if (packaged.version !== manifest.version || packaged.main !== manifest.main || packaged.name !== manifest.name) throw new Error('Versão do aplicativo empacotado incorreta.');

  const executable = `Submundo-Compras-${manifest.version}-Windows-x64.exe`;
  const binary = await fs.readFile(path.join(root, 'dist', executable));
  if (binary.subarray(0, 2).toString('ascii') !== 'MZ') throw new Error('Executável Windows inválido.');
  const checksum = `${crypto.createHash('sha256').update(binary).digest('hex')}  ${executable}\n`;
  const recorded = await fs.readFile(path.join(root, 'dist', `${executable}.sha256`), 'utf8');
  if (recorded.trim() !== checksum.trim()) throw new Error('Checksum do executável não confere.');
  const destination = path.join(root, 'dist/share');
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  await fs.copyFile(path.join(root, 'dist', executable), path.join(destination, executable));
  await fs.writeFile(path.join(destination, `${executable}.sha256`), checksum, 'ascii');
  await fs.writeFile(path.join(destination, 'LEIA-ME.txt'), `SUBMUNDO COMPRAS ${manifest.version} — WINDOWS 10/11, 64 BITS

PRIMEIRO USO
1. Extraia todos os arquivos do ZIP para uma pasta no computador.
2. Execute ${executable}. Não precisa instalar Node.js ou a extensão.
3. Crie seu próprio PIN de exatamente 4 números para o cofre.
4. Em Contato e ajustes, cadastre seu e-mail e telefone.
5. Cadastre seus compradores e cartões, incluindo limite e CVV opcional.
6. Crie seus perfis de navegação e faça login na Meaple em cada um.

O pacote mantém todas as funcionalidades da versão ${manifest.version}: marca
Submundo/808, cofre, compradores/cartões, perfis com sessões separadas,
preenchimento, abertura em lote, status da fila/evento, contadores, filtros,
alertas, acompanhamento dos perfis públicos da Submundo, controle de limites,
compras e ingressos. O pagamento é finalizado manualmente no site.

Nenhum comprador, cartão, CVV, PIN, contato, histórico, marcação de utilização,
cookie ou login do remetente acompanha este pacote. Em um Windows sem uso
anterior do aplicativo, o programa cria seus próprios dados locais vazios.
Se você já usou o aplicativo neste usuário do Windows, ele preserva seus dados
existentes; este pacote não apaga nem substitui os seus cadastros.

Os seus cadastros e sessões ficam separados do executável, no seu usuário do
Windows: %APPDATA%\\Meaple Preenchimento. Para compartilhar o programa, envie
apenas este ZIP. Não envie essa pasta de dados nem cópias do seu perfil Windows.

Os contadores e status são auxiliares. Confira o prazo e a situação no site.
O funcionamento do site e do Instagram depende da conexão e das páginas atuais.
`, 'utf8');
  console.log(`Pacote para compartilhar preparado: ${expected.size} arquivos do aplicativo conferidos, executável e checksum verificados. Apenas EXE, SHA256 e LEIA-ME no ZIP.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
