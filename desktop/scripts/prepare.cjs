'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '../..');
  const destination = path.join(root, 'desktop/app/ui');
  await fs.mkdir(destination, { recursive: true });
  for (const name of ['dates.js', 'vault.js', 'import.js', 'fill.js']) await fs.copyFile(path.join(root, 'src', name), path.join(destination, name));
  for (const [source, name] of [['panel.html', 'popup.html'], ['panel.css', 'popup.css'], ['adapter.js', 'adapter.js'], ['wallet.js', 'wallet.js'], ['tickets.js', 'tickets.js']]) await fs.copyFile(path.join(root, 'desktop/app', source), path.join(destination, name));
  await fs.copyFile(path.join(root, 'desktop/app/assets/submundo.png'), path.join(destination, 'submundo.png'));
  for (const stale of ['popup.js', 'profiles.js']) await fs.rm(path.join(destination, stale), { force: true });
  console.log('Interface desktop preparada com navegação, cofre e controle de compras.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
