'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const browserPanel = `<nav class="desktop-toolbar" aria-label="Perfis de navegação">
  <h2>Perfis de navegação</h2><p id="desktop-count"></p>
  <div class="grid"><label>Perfil de navegação<select id="desktop-profile"></select></label>
  <label>Janela de destino<select id="desktop-target"></select></label></div>
  <div class="actions"><button type="button" id="desktop-open">Abrir / ver Meaple</button><button type="button" id="desktop-new-window" class="secondary">Nova janela neste perfil</button></div>
  <details><summary>Criar ou gerenciar perfis</summary><div class="grid">
    <label>Nome ou prefixo<input id="desktop-label" maxlength="70" placeholder="Ex.: Compras"></label>
    <label>Quantidade<input id="desktop-quantity" type="number" min="1" max="50" value="1"></label></div>
    <div class="actions"><button type="button" id="desktop-create">Criar perfis</button><button type="button" id="desktop-rename" class="secondary">Renomear selecionado</button><button type="button" id="desktop-delete" class="text-button">Excluir selecionado</button></div>
  </details><p id="desktop-state" role="status">Abrindo a Meaple…</p>
</nav>`;
const usagePanel = `<div class="desktop-usage"><h2>Última utilização deste CPF</h2>
  <label class="desktop-check"><input id="desktop-used" type="checkbox" disabled> Já utilizado</label>
  <p id="desktop-usage-state" role="status">Selecione um comprador.</p>
  <p class="help">A data e a hora são atualizadas ao preencher ou marcar a caixa. Você pode desmarcar manualmente. A marcação não confirma pagamento nem bloqueia uma nova utilização.</p>
</div>`;
(async () => {
  const root = path.resolve(__dirname, '../..');
  const destination = path.join(root, 'desktop/app/ui');
  await fs.mkdir(destination, { recursive: true });
  const names = ['popup.html', 'popup.css', 'popup.js', 'dates.js', 'vault.js', 'profiles.js', 'import.js', 'fill.js'];
  for (const name of names) {
    let content = await fs.readFile(path.join(root, 'src', name), 'utf8');
    if (name === 'popup.html') content = content.replace('<title>Preencher checkout</title>', '<title>Meaple — Perfis e preenchimento</title>')
      .replace('<main>', `${browserPanel}<main>`)
      .replace('<h1>Seu comprador.<br>Seu cartão. Um clique.</h1><p>Selecione os perfis, informe o CVV e preencha o checkout.</p>', '<h1>Perfis e preenchimento</h1>')
      .replace('<script src="dates.js">', '<script src="adapter.js"></script><script src="dates.js">')
      .replace('<div class="grid"><label>CVV desta compra', `${usagePanel}<div class="grid"><label>CVV desta compra`)
      .replaceAll('neste navegador', 'neste programa');
    if (name === 'popup.css') content += '\nbody{width:100%;max-width:620px;margin:auto}header{padding:12px 24px}header h1{font-size:22px;margin:4px 0}.desktop-toolbar{padding:10px 24px;background:#18202c}.desktop-toolbar p,.desktop-usage p{font-size:12px;overflow-wrap:anywhere}.desktop-toolbar details{margin:12px 0}.desktop-usage{margin:12px 0;padding:12px;border:1px solid #495874;border-radius:10px}.desktop-check{display:flex;align-items:center;gap:8px}.desktop-check input{width:18px;height:18px;margin:0}.desktop-usage [data-kind=used]{color:#ffda92}\n';
    if (name === 'popup.js') content = content.replace('Abra o checkout da Meaple.', 'Abra o checkout na janela do programa.').replace('Abra o checkout em uma página normal do site e tente novamente.', 'Abra o checkout na janela do programa e tente novamente.');
    if (name === 'profiles.js') content = content.replace('    if (unlocked) timer =', "    document.dispatchEvent(new CustomEvent('checkout-profiles', { detail: unlocked ? vault.list('buyers').map(record => ({ id: record.id, label: record.label, cpf: record.values.cpf })) : [] }));\n    if (unlocked) timer =");
    await fs.writeFile(path.join(destination, name), content);
  }
  await fs.copyFile(path.join(root, 'desktop/app/adapter.js'), path.join(destination, 'adapter.js'));
  console.log('Interface preparada: cofre, máscaras, perfis de navegação e última utilização do CPF.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
