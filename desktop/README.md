# Meaple Preenchimento — aplicativo Windows

Aplicativo independente, com uma janela para os perfis e outra para o site. A extensão não é necessária. O pagamento é finalizado manualmente no site.

## Usar

1. Execute `Meaple-Preenchimento-0.1.0-Windows-x64.exe` no Windows 10/11 de 64 bits. O arquivo portátil extrai o aplicativo temporariamente e abre as duas janelas; não solicita instalação como administrador.
2. No painel, crie uma senha para o cofre e salve seu contato fixo.
3. Cadastre compradores e cartões nas seções **Cadastrar ou editar**. Os cartões podem incluir o endereço de cobrança; o CVV é informado a cada compra.
4. Na janela da Meaple, entre na conta, escolha os ingressos e avance até o checkout.
5. No painel, selecione comprador e cartão, informe CVV e parcelas e clique em **Preencher página agora**. O aplicativo traz a janela do site para frente.
6. Confira os campos, o seguro recusado e o valor. Finalize a compra manualmente no site.

O botão **Abrir / ver site** traz a janela do site para frente ou a reabre se tiver sido fechada. O menu **Aplicativo** permite voltar ou recarregar a página. Ao fechar o painel, o aplicativo é encerrado. As barras de nascimento e validade são inseridas durante a digitação e na importação.

## Perfis e armazenamento

O cofre utiliza os mesmos módulos da extensão: AES-GCM de 256 bits e chave derivada da senha com PBKDF2-SHA-256, salt aleatório e 310.000 iterações. Cada gravação usa um IV aleatório novo. Senha e CVV não são persistidos. A sessão desbloqueada fica somente na memória do aplicativo por até 15 minutos e é encerrada ao sair.

Os arquivos ficam em `%APPDATA%\Meaple Preenchimento\profiles\profiles.json`. E-mail e telefone são locais; compradores e cartões ficam no cofre criptografado. O perfil do site, incluindo cookies de login, fica no diretório de dados do aplicativo, separado do Chrome/Edge. Os perfis da extensão precisam ser cadastrados novamente no programa. Se esquecer a senha, será necessário apagar o cofre e cadastrar novos perfis.

Os dados selecionados são enviados somente ao formulário da Meaple quando o usuário pede o preenchimento. O site e seu provedor de pagamento recebem esses dados. Não há servidor de perfis, telemetria ou sincronização do aplicativo.

## Limites da validação

- A versão foi testada em Electron real no Linux, com painel, cofre, IPC, navegador próprio e formulário local equivalente aos prints. Inclui reinício do processo, persistência criptografada, ausência de CVV e preenchimento sem finalizar compra.
- O executável Windows é gerado neste ambiente, mas sua execução nativa precisa ser verificada no Windows. O workflow `.github/workflows/windows-desktop.yml` foi preparado para repetir os testes no Windows e gerar um artefato baixável; ele só terá resultado depois de ser executado no GitHub.
- O checkout autenticado da Meaple, pagamento real e autenticação bancária não foram testados. O acesso à Meaple foi bloqueado pelo proxy do ambiente. O aplicativo usa uma sessão própria, e o site pode exigir novo login ou validação de acesso.
- Campos em iframes de provedores de pagamento ainda exigem adaptação ao DOM real. A presença de iframe é indicada nas pendências.
- O executável ainda não possui assinatura digital de distribuição. Não há certificado ou credencial embutidos.

## Desenvolvimento

Use o checkout existente em `/workspace/Sub`. Node.js 24 e npm são necessários apenas para desenvolvimento e geração, não para usar o `.exe` pronto.

```sh
cd /workspace/Sub
npm ci --ignore-scripts --no-audit --no-fund
cd desktop
npm ci --no-audit --no-fund
npm test
npm run prepare:app
npm run check
npm start
```

`prepare:app` copia a interface, o cofre, as máscaras e o motor de `src/` para `desktop/app/ui/`, adicionando a adaptação para o aplicativo. Não altera os arquivos da extensão. Os módulos copiados ficam em uma pasta gerada e ignorada pelo Git.

Para a validação completa do aplicativo:

```sh
cd /workspace/Sub/desktop
npm run prepare:app
npm run test:app
```

No Linux, o teste precisa de um display gráfico ou Xvfb. Ele serve a demonstração em `127.0.0.1:8080`, abre um diretório temporário de dados e remove os dados fictícios ao terminar. A porta deve estar livre. O modo de demonstração só funciona no executável de desenvolvimento; o programa empacotado permite preencher somente HTTPS da Meaple e seus subdomínios.

Para gerar o executável Windows:

```sh
cd /workspace/Sub/desktop
npm run build:win
```

O resultado fica em `desktop/dist/`. O comando não publica arquivos. O instalador portátil contém um launcher NSIS de 32 bits e o aplicativo Electron x64; o alvo é Windows de 64 bits. Caches padrão funcionam no Windows. Neste ambiente Linux de arquivos restritos, utilize `XDG_CACHE_HOME=/tmp/sub-desktop-cache`, `ELECTRON_BUILDER_CACHE=/tmp/sub-electron-builder-cache` e a opção `--config.electronDownload.cache=/tmp/sub-electron-cache`.

O download do Electron para testes locais usa `ELECTRON_GET_USE_PROXY=1`, `NODE_USE_ENV_PROXY=1` e `electron_config_cache=/tmp/sub-electron-cache` quando o ambiente fornece proxy. O instalador verifica os checksums oficiais incluídos no pacote Electron. Verificação TLS e de artefatos deve permanecer habilitada.

## Separação entre site e dados locais

A janela do site executa com sandbox, isolamento de contexto e Node desativado, sem preload ou acesso ao armazenamento dos perfis. O preenchimento usa um mundo JavaScript isolado e verifica o destino tanto no processo principal quanto no documento. Somente o painel `app://manager/popup.html` pode chamar o IPC restrito; caminhos de arquivo, canais genéricos e código arbitrário não são aceitos. O painel tem CSP sem conexões de rede. Navegação de pagamento pode abrir páginas HTTPS, mas o preenchimento permanece restrito à Meaple.
