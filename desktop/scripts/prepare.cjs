'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '../..');
  const destination = path.join(root, 'desktop/app/ui');
  await fs.mkdir(destination, { recursive: true });
  const names = ['popup.html', 'popup.css', 'popup.js', 'dates.js', 'vault.js', 'profiles.js', 'import.js', 'fill.js'];
  for (const name of names) {
    let content = await fs.readFile(path.join(root, 'src', name), 'utf8');
    if (name === 'popup.html') content = content.replace('<title>Preencher checkout</title>', '<title>Meaple — Perfis e preenchimento</title>')
      .replace('<main>', '<nav class="desktop-toolbar"><button type="button" id="desktop-open">Abrir / ver site</button><span id="desktop-state" role="status">Abrindo a Meaple…</span></nav><main>')
      .replace('<script src="dates.js">', '<script src="adapter.js"></script><script src="dates.js">')
      .replaceAll('neste navegador', 'neste programa');
    if (name === 'popup.css') content += '\nbody{width:100%;max-width:620px;margin:auto}.desktop-toolbar{padding:12px 24px;display:flex;gap:12px;align-items:center;background:#18202c}.desktop-toolbar span{font-size:11px;color:#b2c0cf;overflow-wrap:anywhere}\n';
    if (name === 'popup.js') content = content.replace('Abra o checkout da Meaple.', 'Abra o checkout na janela do programa.').replace('Abra o checkout em uma página normal do site e tente novamente.', 'Abra o checkout na janela do programa e tente novamente.');
    await fs.writeFile(path.join(destination, name), content);
  }
  await fs.copyFile(path.join(root, 'desktop/app/adapter.js'), path.join(destination, 'adapter.js'));
  console.log('Interface preparada com os mesmos perfis, cofre e máscaras da extensão.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
