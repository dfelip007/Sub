# Instruções para trabalhar neste projeto

## Contexto

O produto principal é **Submundo Compras**, desktop Electron para Windows, versão em `desktop/package.json`. Existe também uma extensão Chrome/Edge na raiz, com versão independente em `manifest.json`/`package.json`. Não confundir as políticas de cofre dos dois produtos.

Leia `COMECE-AQUI.md`, `docs/REQUISITOS-E-DECISOES.md`, `docs/ARQUITETURA.md` e `docs/DESENVOLVIMENTO.md`. Esses documentos transferem o contexto necessário sem depender da conversa original. O pedido atual do usuário tem precedência sobre decisões históricas; preserve os demais comportamentos ao implementar alterações.

Use o checkout/pasta existente. Cada tarefa na nuvem já é isolada; não crie worktrees sem pedido explícito. Não há necessidade de delegar trabalho a outros agentes para preparar este projeto.

## Onde editar

- Interface desktop: `desktop/app/panel.html`, `panel.css`, `adapter.js`.
- Processo nativo/IPC/janelas: `desktop/app/main.cjs`, `preload.cjs`, `policy.cjs`.
- Cofre compartilhado: `src/vault.js`; regras financeiras desktop: `desktop/app/wallet.js`.
- Sessões/perfis/CPF: `desktop/app/workspace.cjs`; tempo/fila: `cart-timer.cjs`, `queue-status.cjs`; filtros/avisos: `monitor.js`.
- Leitura/organização de ingressos: `ticket-reader.cjs`, `tickets.js`; Instagram: `instagram.cjs`, `news.cjs`, `news-reader.cjs`.
- `desktop/app/ui/` é gerado por `npm run prepare:app`. Edite os originais; não use essa pasta como fonte de alterações.
- Módulos `src/` também atendem à extensão: execute seus testes quando os alterar.

## Compatibilidade e regras importantes

1. Preserve o appId `com.dfelip007.meaplecheckout`, o diretório histórico `Meaple Preenchimento`, os IDs e as partições persistentes dos perfis. Renomear a marca não deve perder os dados existentes.
2. Perfis diferentes têm sessões próprias; janelas do mesmo perfil compartilham a sessão. Isso não significa IP/fingerprint distintos nem garantia de lugares independentes em filas.
3. Preencher nunca envia o formulário nem paga. Recusar seguro é parte do preenchimento. Limite só muda após confirmação manual no programa; confirmar/desfazer deve ser idempotente.
4. Desktop: PIN de exatamente quatro dígitos ASCII, inclusive zeros iniciais; sessão de no máximo 30 minutos absolutos; CVV somente se o usuário optar, dentro do cofre criptografado. Extensão: senha de pelo menos dez caracteres, 15 minutos e nenhum CVV persistido.
5. Preserve criptografia, rekey e gravações atômicas. Nunca corrija erro de leitura substituindo dados danificados por cadastros vazios.
6. O horário por CPF e a marca Utilizado do perfil são informativos e independentes. CPF é marcado na tentativa; perfil, somente após ao menos um campo de dados confirmado. Não inferir pagamento por essas marcas.
7. Contagem local de `/orders/` começa em dez minutos na primeira observação por perfil/pedido nesta execução. Recarregar não renova. Contador visível válido menor tem prioridade. A contagem não estende a reserva no servidor.
8. Sala de espera tem prioridade sobre URL de evento. Disponível indica página reconhecida, não estoque/autorização no servidor. Sem sinais confiáveis, mantenha estado desconhecido.
9. Filtrar/ordenar não troca o destino de preenchimento. Abertura em lote continua usando todos os perfis. Alertas acompanham todas as janelas; som é opcional e avisos têm deduplicação.
10. Preserve sandbox, contextIsolation, Node desativado nos sites, validação do remetente IPC e as verificações de origem/URL/geração. Não disponibilize IPC genérico, execução arbitrária ou dados do cofre ao site.

## Verificação

Node.js 24. Dependências travadas pelos dois `package-lock.json`. Na raiz: `npm ci --ignore-scripts --no-audit --no-fund`, `npm test`, `npm run check`. Em `desktop/`: `npm ci --no-audit --no-fund`, `node node_modules/electron/install.js`, `npm test`, `npm run prepare:app`, `npm run check`, `npm run test:app`. Electron 44 pode baixar o binário somente no primeiro uso; o comando explícito permite verificar essa etapa antes do teste.

O teste Electron precisa de display gráfico (ou Xvfb no Linux) e da porta 8080 livre. Ele cria suas próprias páginas e dados temporários; não execute a demonstração ao mesmo tempo. Não use dados reais para testes. `npm start` comum usa os dados normais do usuário; o guia de desenvolvimento descreve o modo separado de demonstração.

Em testes Playwright, não use `waitForFunction(async () => desktopBridge...)`: a versão instalada pode considerar a Promise verdadeira sem esperar o resultado. Use o padrão de polling Node `waitCheckout`/`waitNews` de `desktop/scripts/smoke.cjs`. Preserve foco e estado de `<details>` ao reordenar listas.

Execute testes adequados às mudanças e não desabilite assertions para obter sucesso. Relate verificações não executadas. Os testes existentes usam páginas fictícias; não comprovam checkout autenticado, pagamento real, fila real nem som físico no computador do usuário.

## Compilar e compartilhar

Windows: `cd desktop` e `npm run build:win`. O workflow `.github/workflows/windows-desktop.yml` executa testes, build, checksums, auditoria do ASAR e pacotes. Preserve a edição dos recursos de ícone/metadados e `signAndEditExecutable: true`; não houve assinatura com certificado de distribuição configurada.

Nunca inclua userData, cofre, cookies, arquivos de sessão, PIN, contatos ou credenciais nos pacotes. `desktop/scripts/share.cjs` confere os arquivos do programa e prepara o executável público. `scripts/package-project.cjs` exporta fontes do commit Git identificado, sem `.git`/dependências/dados, e cria o pacote completo. Adapte a lista explícita do auditor de ASAR quando adicionar/remover módulos legítimos; não remova a conferência.

Atualize a documentação quando regras do produto ou a estrutura mudarem. Não implemente sugestões do histórico como se já estivessem autorizadas: o backlog documentado ainda precisa de pedido concreto do usuário.
