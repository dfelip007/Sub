# Desenvolvimento, testes e novas entregas

## Requisitos e instalação

- Node.js **24** e npm. O CI usa Windows e Node 24.
- Windows 10/11 x64 para o programa pronto e para compilar o EXE com os recursos de ícone/metadados. Electron **44.7.2** e electron-builder **26.15.3** estão travados no lockfile desktop.
- Git para versionamento/Actions/exportação identificada de fontes; não é obrigatório para rodar o código extraído ou compilar o EXE localmente.
- Python 3 é opcional para a demonstração manual/extensão histórica. O smoke desktop serve suas próprias páginas com Node.
- Linux: bibliotecas gráficas necessárias ao Electron e display gráfico ou Xvfb. A geração Windows preservando recursos usa um runner Windows; não desative edição de ícone para contornar falta de Wine.

Na pasta que contém `AGENTS.md`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
cd desktop
npm ci --no-audit --no-fund
node node_modules/electron/install.js
npm test
npm run prepare:app
npm run check
```

`npm ci` exige os lockfiles incluídos. Na versão 44, o pacote Electron pode adiar o download do binário até o primeiro uso. `node node_modules/electron/install.js` antecipa e verifica esse download com os checksums oficiais; repeti-lo é seguro se a instalação já estiver pronta. Internet é necessária para npm/Electron, mas nenhum segredo do remetente é necessário. Se o ambiente de nuvem exigir proxy/permissão de rede, use as configurações fornecidas por esse ambiente, sem desativar TLS ou checksums.

Em ambientes Linux que fornecem proxy pelas variáveis padrão, este comando foi validado para o download (em `desktop/`):

```sh
ELECTRON_GET_USE_PROXY=1 NODE_USE_ENV_PROXY=1 electron_config_cache=/tmp/sub-electron-cache node node_modules/electron/install.js
```

Essas opções não são credenciais e não são necessárias no Windows com conexão direta. Uma falha de download não comprova defeito do aplicativo; confira acesso a npm/GitHub, proxy e a presença do binário antes de executar o smoke.

## Abrir e testar

Em `desktop/`, `npm start` prepara a interface e abre o programa com a Meaple real. Esse modo usa o diretório normal de dados do usuário, inclusive cadastros preexistentes.

Para testes completos isolados:

```sh
cd desktop
npm run prepare:app
npm run test:app
```

Mantenha a porta `127.0.0.1:8080` livre. Não execute `npm run demo` ao mesmo tempo: o smoke cria servidor próprio, checkout e Instagram fictícios, diretório temporário, cadastros de teste e reinícios controlados. No Linux com Xvfb instalado, execute `xvfb-run -a npm run test:app`; não assuma que um display/processo de uma tarefa anterior continuará vivo.

Para explorar manualmente a interface com dados separados no Windows, em um terminal na raiz:

```powershell
py -3 -m http.server 8080 --bind 127.0.0.1 --directory demo
```

Em outro terminal, na pasta `desktop/`, depois de instalar/preparar:

```powershell
npx electron . --smoke-test "--test-data=$env:TEMP\Submundo-Dev-Ficticio"
```

Use somente dados fictícios. Esse diretório manual permanece para a próxima sessão de desenvolvimento. O checkout de demonstração não cobra nada; não simula todas as filas, rotas, temporizadores ou novidades. Para esses casos, use/adapte os fixtures de `desktop/scripts/smoke.cjs`. As flags de teste são recusadas no aplicativo empacotado.

## Testes existentes e evidências

| Comando | Escopo |
| --- | --- |
| Raiz: `npm test` | Máscaras, preenchimento/seguro, importação, cofre/interface da extensão e exportação de projeto |
| Raiz: `npm run check` | Sintaxe dos módulos da extensão/compartilhados |
| Desktop: `npm test` | Cofre/PIN/expiração, finanças, ingressos, perfis/CPF, tempo, fila, filtros, avisos e novidades |
| Desktop: `npm run check` | Sintaxe dos módulos desktop |
| Desktop: `npm run test:app` | Electron real, IPC, navegação, sessões, múltiplas janelas, reinício e integração dos recursos |
| Raiz: `npm run test:browser` | Teste opcional no Chromium instalado, com demonstração rodando e `CHROMIUM_PATH` se necessário |

Antes da documentação de transferência, havia 22 testes na raiz e 62 desktop. O pacote/CI desta entrega registra os resultados atuais; novos testes de empacotamento podem aumentar a contagem. Zero testes executados não é validação. O smoke também produz capturas em `test-results/`, que não vão para os pacotes.

Os testes de checkout/fila/Instagram são fictícios e não garantem compatibilidade com mudanças dos sites. Em Playwright 1.56.1, espere IPC assíncrono por polling Node, conforme `waitCheckout`/`waitNews`, sem predicate async em `waitForFunction`.

## Compilar o aplicativo Windows

Em Windows, na pasta `desktop/`:

```sh
npm run build:win
```

Gera `desktop/dist/Submundo-Compras-<versão>-Windows-x64.exe` e a aplicação desempacotada em `win-unpacked/`. O portátil usa launcher NSIS e runtime Electron x64; o alvo é Windows de 64 bits. Não é preciso instalar o projeto no computador que usará o EXE. O processo não publica por conta própria e não configura certificado de assinatura.

Para preparar a distribuição simples, gere o hash em PowerShell e execute o auditor:

```powershell
Get-ChildItem dist/*.exe | ForEach-Object {
  $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $($_.Name)" | Set-Content -Encoding ascii -LiteralPath ($_.FullName + '.sha256')
}
node scripts/share.cjs
```

Execute esse bloco em `desktop/`. A saída `dist/share/` contém somente EXE, SHA256 e LEIA-ME. O auditor confere a lista explícita de arquivos do ASAR e seus conteúdos com o código preparado, a versão e o hash. Quando adicionar um módulo legítimo, atualize a lista do auditor e teste; não desative a verificação.

## Gerar pacotes de código e projeto completo

O exportador usa **os arquivos do commit Git HEAD**, não copia seu diretório inteiro. Faça commit das alterações antes de empacotar. Ao receber apenas o ZIP e querer versionar seu trabalho, na raiz extraída:

```sh
git init
git add .
git commit -m "Importar projeto Submundo Compras"
```

Revise os arquivos antes do commit; não adicione dados locais. A pasta exportada contém `.gitignore`. Git pode pedir que você configure nome/e-mail de autoria no seu computador; nenhuma conta/token do remetente é necessária para esse commit local.

Na raiz do projeto:

```sh
node scripts/package-project.cjs --source-only
```

Prepara `desktop/dist/source/` com fontes, documentos, testes, logo, dois lockfiles e workflow. Inclui `ENTREGA.json` e `INTEGRIDADE-SHA256.json`. Não inclui histórico Git, dependências instaladas, arquivos gerados, caches ou dados de usuários.

Depois de gerar/verificar o EXE e `dist/share/`, execute na raiz:

```sh
node scripts/package-project.cjs
```

Prepara também `desktop/dist/project/` com `executavel/`, `projeto/`, instruções e integridade. O workflow faz upload dessas pastas como ZIPs automaticamente. Para compactar localmente no PowerShell a partir da raiz:

```powershell
tar.exe -a -cf Submundo-Codigo-Fonte-Codex.zip -C desktop/dist/source .
tar.exe -a -cf Submundo-Projeto-Completo-Windows-x64.zip -C desktop/dist/project .
```

O `tar.exe` das versões atuais do Windows preserva os arquivos ocultos necessários, como `.gitignore` e `.github/workflows/`. O `Compress-Archive` pode omiti-los em alguns ambientes. Os artefatos do workflow usam `include-hidden-files: true` apenas nos diretórios auditados da entrega. Nunca habilite isso apontando para o checkout inteiro.

## Usar seu próprio GitHub/Codex

Você pode criar um repositório e enviar a pasta extraída, ou fazer fork de `dfelip007/Sub`. O trabalho de distribuição está na branch `desktop-windows`; a branch padrão `main` pode não ter a versão entregue. Consulte o commit exato em `ENTREGA.json`. Para um repositório novo, envie os arquivos do projeto, não o EXE nem dados locais.

O workflow **Aplicativo Windows** em `.github/workflows/windows-desktop.yml` tem execução manual (`workflow_dispatch`) e disparo por alterações relevantes. Em forks, pode ser necessário habilitar Actions na interface. Não exige PAT do remetente, certificado ou secrets para este build; usa permissões de leitura de conteúdo e upload de artefatos.

O workflow instala, testa, prepara, compila, confere e entrega:

- `Submundo-Windows-x64`: programa e primeiro uso.
- `Submundo-Codigo-Fonte-Codex`: projeto completo sem binário Electron, adequado à análise.
- `Submundo-Projeto-Completo-Windows-x64`: executável e fontes juntos.

Os artefatos são ZIPs e exigem login GitHub para baixar; a retenção configurada é de 14 dias. Depois de baixar, os arquivos podem ser usados localmente. Não há Release permanente ou atualização automática implementada.

## Evoluir sem perder compatibilidade

Edite originais, rode `prepare:app` e testes pertinentes. Revise dados/IPC/partições quando mexer em persistência. Não altere appId ou pasta histórica de dados por causa da marca. Ao mudar formato do cofre, planeje migração atômica e teste falha/reabertura. Ao alterar fontes compartilhadas, teste também a extensão; a política de CVV/PIN dela é diferente.

Para uma versão funcional nova, atualize somente os campos de versão do desktop em `desktop/package.json` e os correspondentes do lockfile, sem substituir números globalmente em dependências. Atualize instruções e gere um novo pacote. Não existe exigência de reproduzir o mesmo hash binário entre builds; use o hash da compilação concreta.
