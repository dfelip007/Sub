# Requisitos e decisões do produto

Este documento descreve o estado entregue da versão desktop 0.9.0. A origem foi a necessidade de preencher rapidamente o checkout da Meaple antes do prazo do carrinho, usando muitos compradores, cartões e sessões. O pagamento permanece sob controle do usuário. O aplicativo é de uso local; não existe conta central, sincronização ou serviço de compras.

## Recursos existentes

| Área | Comportamento que deve ser preservado |
| --- | --- |
| Compradores | Cadastro independente de nome, CPF e nascimento; qualquer comprador pode ser combinado com qualquer cartão |
| Contato | E-mail e telefone fixos para os preenchimentos, configurados pelo usuário local |
| Datas | Máscaras/normalização de nascimento e validade, inclusive entrada sem barras; adaptação a campos de data/mês |
| Preenchimento | Comprador, cartão, cobrança, parcelas e recusa de seguro; campos ausentes/ambíguos são reportados; não envia a compra |
| Cartões | Vários cartões, titular, validade, endereço, CVV opcional e limite disponível; evita PAN duplicado para não dividir o controle de limite |
| Cofre | PIN de quatro números, sem PIN padrão; desbloqueio de até 30 minutos absolutos; migração da senha antiga sem apagar os dados |
| Perfis | Até 100 perfis, criação de até 50 por operação; cada um com sessão própria e várias janelas possíveis |
| Abertura em lote | Link HTTPS do evento aberto em todos os perfis salvos; reaproveita janela exatamente naquele link e preserva outros carrinhos |
| CPF utilizado | Horário da última utilização, normalizado sem pontuação, compartilhado entre perfis desta instalação; correção manual com confirmação |
| Perfil utilizado | Marca e horário após ao menos um campo de dados preenchido; limpeza manual independente do CPF |
| Prazo | Contador visível do site e regra local de dez minutos em `/orders/`; por perfil/pedido; destaque de urgência e expiração |
| Fila/evento | Status por janela, resumo por perfil; Sala de espera, Disponível, Liberado, No checkout, carregando, erro, externo e desconhecido |
| Filtros | Busca sem diferenciar acentos/maiúsculas, status, utilização, menor prazo ou ordem de cadastro; combinação e persistência |
| Avisos | Até 20 avisos visuais recentes; liberação após espera observada e últimos dois minutos; som opcional do Windows e botão Testar som |
| Compras | Pendências locais, confirmação manual, limite em centavos, histórico, cancelamento de pendência e reversão de registro |
| Ingressos | Leitura de evento, categoria, lote, quantidade, preço unitário e total quando identificáveis; revisão manual |
| Revenda | Rateio exato do total pago, custo por grupo, preço desejado de revenda, projeção e CSV; não publica anúncios nem comprova vendas |
| Novidades | Acompanhamento de conteúdo público identificável de `festivalsubmundo808` e `submundo808`, com estados de login/erro/leitura |
| Marca | Submundo Compras, logo do cão/808 e ícone Windows incluídos |

## Decisões que esclarecem o pedido original

- “Como uma conta” significa cadastro local de comprador/cartão no cofre; não foi criado login de serviço nem servidor multiusuário.
- O usuário pediu uma marca de última utilização de CPF para organização. **Não é bloqueio permanente por CPF ou por evento.** Excluir comprador/cofre não apaga a marca por CPF; existe correção manual própria.
- Marcar perfil é diferente de marcar CPF. CPF pode ficar utilizado após tentativa parcial/falha; o perfil só é marcado depois que há confirmação de campo de dados preenchido. Recusar seguro sozinho não basta.
- As sessões são perfis do Chromium/Electron do próprio aplicativo. São independentes entre perfis, mas não controlam todos os perfis/abas de Chrome/Edge externos. Duas janelas de um mesmo perfil compartilham login.
- O usuário informou dez minutos ao entrar em `https://meaple.com.br/orders/`. A regra local é uma estimativa desde a primeira observação; um carrinho preexistente pode ter menos tempo real. Recarregar, alterar query/hash ou reabrir o mesmo pedido na mesma execução não renova o prazo. Reiniciar o aplicativo descarta os prazos em memória.
- `/808/submundo-808-curitiba-pr` e outras rotas `/<organizador numérico>/<evento>` são reconhecidas como Disponível sem depender de botão de compra. O link de abertura em lote também registra uma referência exata de evento durante a execução. Sala de espera, erro e checkout têm prioridade.
- Disponível/Liberado descreve a página observada. Não garante estoque, autorização no servidor, reserva ou posição na fila.
- O valor disponível do cartão é um controle manual local. **Preencher não desconta.** Depois de pagar no site, Registrar pagamento desconta o total, inclusive em compra parcelada, uma única vez. Desfazer registro devolve apenas o saldo do controle local; não faz estorno bancário.
- CVV persistido foi solicitado explicitamente para o desktop e é opcional por cartão, dentro do cofre. A extensão continua sem salvar CVV. Um computador local não é imune a acesso indevido; não registrar dados sensíveis em logs ou documentação.
- PIN: exatamente quatro dígitos ASCII; preserve zeros iniciais. Uso contínuo não prolonga os 30 minutos. PIN curto é uma escolha de conveniência, não uma garantia contra adivinhação de um arquivo roubado.
- Alertas funcionam com aplicativo aberto, inclusive minimizado/cofre bloqueado; não são um serviço de notificações com o aplicativo fechado. Ativar som não reproduz avisos antigos. Limpar avisos não rearma a deduplicação.
- Filtrar a lista não muda o destino selecionado. O programa avisa quando esse destino está oculto. Abrir todos os perfis inclui os ocultos pelos filtros.

## Limitações conhecidas

1. O checkout autenticado, pagamento real e fila real da Meaple não foram validados a partir desta nuvem. O proxy bloqueou as conexões ao site; os testes usam HTML fictício. O usuário relatou funcionamento em seu Windows, mas isso não substitui teste da página atual no computador do destinatário.
2. Mudanças de HTML/máscaras e campos em iframe de provedores podem exigir adaptação. Não escolher campos ambíguos nem inventar total/prazo/dados ausentes.
3. Instagram não usa API oficial configurada. Login, HTML, bloqueios ou conteúdo não identificável podem impedir atualizações. Não garante todos os stories/postagens em tempo real.
4. O teste de som verifica a chamada nativa; volume e audição física dependem do Windows. O launcher portátil não foi aberto separadamente pelo teste automatizado, que exercita Electron antes do empacotamento.
5. Não há assinatura de distribuição configurada, atualizador automático, garantia de reserva/compra ou controle de identidade de fila por IP/fingerprint.
6. Cofre perdido não tem recuperação de PIN. O pacote compartilhado não leva dados privados do remetente; o destinatário cadastra tudo novamente.

## Sugestões ainda não implementadas

Foram discutidas como possíveis próximas melhorias: backup criptografado/restauração, checklist antes das vendas, resumo do dia, aviso adicional de carrinho já preenchido e distribuição permanente de versões. **Não fazem parte desta entrega** e não devem ser anunciadas como prontas. Um futuro pedido do usuário pode autorizar implementá-las.

A entrega do projeto inclui código e instruções para análises e modificações pelo destinatário, sem mudar automaticamente o regime de licença indicado nos arquivos existentes. Não há credenciais, certificados ou direitos de acesso do remetente que precisem ser transferidos para executar o programa.
