# Arquitetura e mapa do código

## Estrutura

```text
src/                         extensão e módulos compartilhados
demo/                        checkout fictício, sem cobrança
test/                        testes compartilhados/extensão e empacotamento
desktop/
  app/                       processo nativo, painel e domínio desktop
    assets/                  logo e referência de marca
    ui/                      GERADO; não editar
  scripts/                   preparar interface, smoke, conferir distribuição
  test/                      testes desktop
  package.json               versão/dependências/build do desktop
scripts/                     CI, exportação do projeto e scripts da extensão
docs/                        contexto transferível de produto e desenvolvimento
.github/workflows/           compilação/testes e artefatos Windows
```

O desktop é JavaScript/CommonJS e scripts de navegador, sem TypeScript/bundler/transpilação. Electron e electron-builder são dependências de desenvolvimento; o executável inclui seu próprio runtime. `prepare.cjs` copia módulos e interface para `desktop/app/ui/`. Os dois lockfiles são necessários: um da raiz (jsdom/Playwright) e outro do desktop (Electron/build).

## Módulos e responsabilidades

| Arquivo | Responsabilidade |
| --- | --- |
| `desktop/app/main.cjs` | Ciclo de vida, janelas, sessões, IPC, protocolo local, polling, preenchimento isolado, CSV e som |
| `desktop/app/preload.cjs` | Ponte restrita `desktopBridge` para o painel |
| `desktop/app/policy.cjs` | Origem de preenchimento, navegação HTTPS, validação dos dados e link do evento |
| `desktop/app/panel.html`, `panel.css` | Layout e navegação desktop |
| `desktop/app/adapter.js` | Estado da interface, formulários, integração do cofre/domínio com a ponte nativa |
| `src/vault.js` | Criptografia, credenciais, sessão, rekey e escrita transacional do conteúdo do cofre |
| `desktop/app/wallet.js` | Especialização do cofre: PIN, CVV opcional, limite e ciclo das compras |
| `desktop/app/store.cjs` | Persistência nativa do envelope/contato; sessão desbloqueada só em RAM; validação e gravação atômica |
| `desktop/app/workspace.cjs` | Perfis, partições, seleção, marca de perfil, ledger de CPF e preferências de acompanhamento |
| `src/fill.js` | Localização dos campos e preenchimento, sem envio da compra |
| `src/dates.js`, `import.js` | Máscaras/normalização e importação temporária de texto |
| `desktop/app/cart-timer.cjs` | Leitura contextual de contador e prazos locais por pedido/perfil |
| `desktop/app/queue-status.cjs` | Sinais visíveis de fila/evento, referência de URL e transições por janela |
| `desktop/app/monitor.js` | Preferências, filtros/ordenação puros e deduplicação de avisos |
| `desktop/app/ticket-reader.cjs` | Leitura conservadora do resumo visível de ingressos |
| `desktop/app/tickets.js` | Normalização, custos/rateio em centavos, projeções e CSV |
| `desktop/app/instagram.cjs` | Janelas/leitores do Instagram e coordenação de atualização |
| `desktop/app/news-reader.cjs`, `news.cjs` | Extração de links identificáveis, persistência e estados de novidades |
| `src/popup.*`, `profiles.js` | Interface e integração específicas da extensão, separadas do desktop |
| `desktop/scripts/share.cjs` | Auditoria dos arquivos no ASAR, versão/hash e distribuição só do executável |
| `scripts/package-project.cjs` | Exportação de fontes do commit e entrega completa para outro desenvolvedor |

## Fluxo de preenchimento

1. O usuário seleciona perfil/janela, comprador e cartão no painel local.
2. O cofre é desbloqueado por WebCrypto no contexto confiável. Contato fixo é combinado com os valores selecionados; o CVV pode vir do cofre ou ser digitado.
3. A interface cria/reaproveita uma pendência financeira criptografada; isso não desconta saldo.
4. O processo nativo valida remetente IPC, origem da janela, valores e destino. Registra a tentativa de uso do CPF.
5. `fill.js` roda no mundo JavaScript isolado 1007 da página permitida. A origem é validada também dentro do documento. Os dados são enviados ao formulário por ação do usuário, sem submissão.
6. O resultado informa campos preenchidos e pendências. Se houve campo de dados confirmado, marca o perfil nativo de destino; a seleção atual da interface pode ter mudado durante a operação e não deve decidir qual perfil marcar.
7. O usuário confere e paga no site. Depois confirma o registro no programa, que altera o controle de limite e a lista de ingressos uma vez.

Falha em salvar a marca do perfil depois de preencher precisa ser exibida como falha de marcação, sem dizer que os campos não foram preenchidos. Pendência, CPF, perfil utilizado e pagamento são registros com significados diferentes.

## Dados em disco e em memória

No Windows, userData é `%APPDATA%\Meaple Preenchimento`. Preserve esse nome e o appId `com.dfelip007.meaplecheckout` em atualizações.

| Local | Conteúdo |
| --- | --- |
| `profiles/profiles.json` | `contact` (e-mail/telefone locais) e `checkoutVault` (envelope criptografado) |
| `profiles/workspace.json` | versão, segredo HMAC local, perfis `{id,label,lastFilledAt?}`, seleção, ledger `usage`, preferências `monitor` |
| `profiles/news.json` | Metadados públicos/links de novidades e preferências/leituras, sem mídia/PIN |
| Partições Electron em userData | Cookies, localStorage, IndexedDB e demais dados de navegação da própria sessão |
| Somente RAM | Chave/sessão desbloqueada, janelas/IDs, leituras de DOM, prazos locais, deduplicação e histórico recente de avisos |

Envelope do cofre: `version`, `iterations:310000`, `salt`, `iv`, `ciphertext`, `credential:'pin4'` para cofres desktop migrados/novos. AES-GCM 256, PBKDF2-SHA-256, salt aleatório e IV novo em cada gravação. O conteúdo descriptografado reúne compradores, cartões e `orders`; nunca o persistir como JSON aberto.

Compradores e cartões têm UUID, rótulo e `values`. Os nomes de campos estão em `src/vault.js`: `buyerName`, `cpf`, `birthDate`; `cardNumber`, `cardHolder`, `cardExpiry`, `country`, `postalCode`, `city`, `state`, `street`, `streetNumber`. Desktop pode adicionar `cardCvv` por opção e `budgetCents` no cartão.

Ordens incluem UUID, `scope`, `cardId`, `buyerId`, referências de exibição, `amountCents`, timestamps e status `pending`, `confirmed`, `canceled` ou `reversed`; podem incluir `tickets` e referência do pedido. Disponível = `budgetCents` menos o total das ordens confirmadas. Editar disponível recalcula a base sem apagar histórico. Valores monetários são inteiros em centavos; rateios usam BigInt para fechar o total sem perdas de arredondamento.

`Store` e `Workspace` serializam operações, escrevem temporário e renomeiam. Preservam o arquivo original quando a leitura é inválida. Limpezas de marca usam o horário esperado para evitar apagar atualização mais recente. A chave HMAC por instalação impede gravar o CPF literal no ledger, mas o ledger não é parte do cofre financeiro criptografado.

## Sessões, status e prazos

`partition('legacy')` preserva `persist:meaple-checkout`; demais IDs usam `persist:meaple-<UUID>`. O processo principal mantém um mapa por `webContents.id` com perfil, geração de navegação e leituras. Cada perfil tem sessão própria; janelas do mesmo perfil usam a mesma partição. Não usar a partição padrão para janelas de perfis diferentes.

Polling aproximado de um segundo, mesmo em segundo plano/cofre bloqueado. Leituras assíncronas verificam URL e geração capturadas, evitando aplicar resultado antigo a outra página. Leituras DOM com mais de cinco segundos deixam de ser atuais. Navegação invalida os sinais; os prazos locais de pedidos permanecem em RAM conforme sua identidade.

Temporizador local usa perfil + origem + primeiro identificador após `/orders/`. Query/hash e subpáginas não criam outro prazo. Um contador visível menor limita a estimativa local; zero não volta a dez minutos. Estado de espera vem do título/cabeçalho visível; event routes conhecidas permitem Disponível sem botão reconhecível. Sinais de erro/espera têm prioridade. Código não consulta tokens, APIs privadas nem posição de fila.

`monitor.js` é UMD/CommonJS para compartilhar filtros com os testes/processo nativo. Filtra somente as listas, sem alterar seleção. Avisos são gerados a partir do estado completo e deduplicados por evento/janela ou pedido/perfil. Limpar a lista não limpa os conjuntos de deduplicação. Preferências são persistidas em workspace; os avisos não são persistidos.

## Ponte e fronteiras de acesso

Somente `app://manager/popup.html` pode usar os handlers nativos, validados por remetente/frame. `preload.cjs` expõe métodos específicos para cofre, checkout, perfis, CPF, monitoramento, CSV e novidades. Para alterar um contrato IPC, revise juntos preload, handlers e adapter, incluindo testes.

Janelas do site: `nodeIntegration:false`, `contextIsolation:true`, sandbox, webSecurity, sem preload de controle. Navegação pode usar provedores HTTPS de pagamento; preenchimento de produção é restrito à Meaple/subdomínios. O modo localhost só existe em desenvolvimento (`!app.isPackaged` + flag de smoke). O painel local tem CSP sem conexões de rede.

Não há backend, login da aplicação, servidor de compradores, telemetria, chave de API ou integração bancária. A Meaple/provedor recebe o conteúdo do formulário, e Instagram é acessado como site. Uma adaptação futura deve preservar essa separação ou documentar explicitamente qualquer mudança de produto.
