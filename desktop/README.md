# Submundo Compras — aplicativo Windows

Para trabalhar com o código em outro Codex, leia [COMECE-AQUI.md](../COMECE-AQUI.md), [arquitetura](../docs/ARQUITETURA.md), [requisitos](../docs/REQUISITOS-E-DECISOES.md) e [desenvolvimento](../docs/DESENVOLVIMENTO.md). O workflow também entrega **Submundo-Codigo-Fonte-Codex** e **Submundo-Projeto-Completo-Windows-x64**, com documentação e fontes da revisão identificada, sem dados de usuários.

Aplicativo da Submundo para compras na Meaple, com painel central e vários perfis de navegação, cada um com cookies e login separados. A extensão não é necessária. O pagamento é finalizado manualmente no site.

A marca e a logo Submundo / 808 aparecem no painel e nos ícones do Windows. A imagem foi preparada a partir da logo fornecida na conversa. A Meaple continua sendo o site de compra. A pasta histórica de dados `%APPDATA%\Meaple Preenchimento` e o identificador do aplicativo são mantidos para preservar os cadastros e as sessões das versões anteriores.

## Usar e atualizar

Para compartilhar com outra pessoa, baixe o ZIP **Submundo-Windows-x64** nos artefatos da compilação Windows no GitHub Actions. Ele contém somente o executável, seu SHA256 e o guia `LEIA-ME.txt`. A compilação confere os arquivos do aplicativo e preserva todas as funcionalidades; nenhum cadastro, cartão, CVV, contato, PIN, histórico ou sessão do remetente é incluído. Não envie a pasta `%APPDATA%\Meaple Preenchimento`. O destinatário extrai o ZIP e cadastra seus próprios dados; se já usava o programa naquele usuário Windows, seus dados existentes são preservados.

1. Feche a versão anterior e execute `Submundo-Compras-0.9.0-Windows-x64.exe` no Windows 10/11 de 64 bits. O arquivo portátil não exige instalação como administrador. Os dados e o PIN das versões 0.4/0.5/0.6/0.7 permanecem no mesmo diretório. Para cofres das versões 0.1/0.2/0.3, use a senha existente uma vez, sem apagar o cofre, e depois defina seu PIN de 4 números em **Contato e ajustes → PIN do cofre**. Os cartões antigos começam sem limite informado e sem CVV salvo.
2. Desbloqueie o cofre com o PIN ou crie um PIN de exatamente 4 números no primeiro uso. Em **Contato e ajustes**, salve e-mail e telefone.
3. Em **Compradores**, use **Novo comprador** para cadastrar nome, CPF e nascimento. Em **Cartões**, use **Novo cartão** para cadastrar número, titular, validade, endereço e limite disponível. A gravação de CVV é opcional por cartão: informe o código e marque **Salvar o CVV no cofre deste cartão**.
4. Em **Perfis de navegação**, informe um prefixo e a quantidade (por exemplo, 15) e clique em **Criar perfis**. Você pode manter até 100 perfis, criando até 50 por vez. **Usar este perfil** abre a Meaple na sessão escolhida. Faça login, escolha ingressos e avance ao checkout.
5. Em **Comprar**, confira o perfil e a janela de destino, selecione comprador e cartão e confira a última utilização do CPF. O CVV salvo é carregado após desbloquear; se não estiver salvo, informe-o. Escolha parcelas e, se souber, o valor total. Clique em **Preencher checkout**.
6. Confira os campos, o seguro recusado e o valor na Meaple. Finalize o pagamento manualmente no site.
7. Após o pagamento ser aprovado, clique em **Registrar pagamento**, confira o valor total e confirme. O programa desconta o valor do disponível daquele cartão e grava o histórico.

As telas **Comprar**, **Compradores**, **Cartões**, **Perfis de navegação**, **Histórico de compras**, **Novidades** e **Contato e ajustes** ficam na navegação lateral. Os cadastros são editados separadamente da compra. Cartões são identificados pelo nome e pelos quatro últimos dígitos, sem mostrar o número completo nas listas.

**Abrir / ver Meaple** traz a janela selecionada para frente ou abre o site no perfil selecionado. **Nova janela neste perfil** compartilha o login do mesmo perfil. Outros perfis usam cookies separados e continuam abertos; escolha o destino antes de preencher. O programa preenche uma janela por vez, pelo botão. O menu **Aplicativo** permite voltar ou recarregar. Ao fechar o painel, o aplicativo é encerrado. Nascimento e validade recebem as barras automaticamente durante a digitação e a importação.

## Novidades dos perfis da Submundo

A aba **Novidades** acompanha `@festivalsubmundo808` e `@submundo808`. **Verificar agora** consulta as páginas oficiais, com intervalo mínimo de 30 segundos entre consultas manuais. Para acompanhar enquanto usa o programa, marque **Acompanhar a cada 5 minutos**. A preferência fica salva e é retomada ao abrir o aplicativo. Ao pausar, as janelas de leitura em segundo plano são encerradas. Fechar o programa encerra o acompanhamento: não há serviço externo ou alertas com o programa fechado.

Na primeira leitura confirmada de cada perfil, o conteúdo encontrado vira referência e não dispara aviso de novidade. Itens desconhecidos em leituras posteriores recebem aviso, com data e hora de **detecção** em Brasília. O contador aparece na navegação e no atalho **Novidades** do cabeçalho, inclusive nas outras telas. Esse horário não é a data de publicação no Instagram. Mudanças em posts fixados ou na grade também podem revelar conteúdo antigo ainda desconhecido pelo programa. Abrir um item marca seu aviso como lido; **Marcar avisos como lidos** limpa os demais avisos locais.

**Abrir perfil / entrar** abre o Instagram no programa para consultar o perfil ou fazer login diretamente no site, se necessário. A sessão é própria do Instagram, compartilhada entre os dois perfis acompanhados, e separada das sessões da Meaple e do cofre. O programa não oferece campo próprio de senha do Instagram, não lê valores de senha e não exporta cookies. As janelas de consulta são separadas das janelas visíveis: verificar novidades não interrompe um story nem a tela de login que você esteja usando. **Ver stories** abre o visualizador oficial, por ação do usuário.

A detecção é baseada nos links que o Instagram disponibilizar no perfil. Posts e reels identificáveis podem gerar avisos. **Stories só geram aviso quando houver um link para um story específico do perfil**; um link genérico para stories não comprova conteúdo novo. A ausência de identificação aparece como **sem confirmação automática**, e não como ausência de stories. Stories podem expirar antes de você abri-los. O programa não visualiza stories automaticamente durante as consultas.

O painel diferencia **última leitura confirmada** de **última tentativa**. Login, conta privada, redirecionamento, bloqueio ou página incompleta preservam o histórico e o horário da leitura anterior, com aviso de indisponibilidade. A leitura não é garantida e depende do acesso e do formato atual do Instagram. O acesso real foi bloqueado por CONNECT 403 neste ambiente de nuvem: a validação usa páginas fictícias, incluindo posts, reels, story específico, login e falha de leitura. O funcionamento com os perfis reais precisa ser conferido no computador do usuário; pode exigir login ou adaptação ao HTML do Instagram. Não há API oficial configurada nem garantia de capturar todos os stories/publicações em tempo real.

O histórico local guarda até 60 itens e 1.000 identificadores conhecidos por perfil em `profiles/news.json`, com links públicos e estados de leitura, separado do cofre financeiro. Nenhuma imagem, vídeo ou senha é gravada nesse arquivo. Arquivo danificado é preservado e não impede o uso dos recursos de compra. A preferência de acompanhamento, os avisos e as leituras sobrevivem ao reinício. A função funciona com o cofre bloqueado.

## Abrir todos os perfis no evento

Nas telas **Comprar** e **Perfis de navegação**, cole o link HTTPS do evento na Meaple e clique em **Abrir todos os perfis** ou pressione **Enter** no campo. O mesmo link será aberto em todos os perfis cadastrados, com os logins e cookies separados. Os dois campos de link ficam sincronizados enquanto o programa estiver aberto. Não é necessário desbloquear o cofre para abrir as sessões.

Para cada perfil, o programa reaproveita uma janela que já esteja exatamente no link informado. Se não existir, abre uma nova. As outras janelas e carrinhos são preservados, assim como a seleção de perfil/janela de preenchimento. Caso uma janela tenha avançado ao carrinho, um novo comando abre outra janela no evento para aquele perfil. Janelas já no evento não são duplicadas. Uma janela com erro no mesmo link pode ser recarregada ao tentar novamente.

A navegação começa imediatamente em pequenos grupos, com progresso no painel; a abertura de outros perfis não espera a conexão de cada site terminar. Ao concluir, o painel informa quantas janelas foram criadas/reaproveitadas e eventuais falhas ao criar janelas. O carregamento do site continua independentemente em cada sessão; aguarde-o antes de comprar. A abertura em lote aceita links HTTPS da Meaple/subdomínios, sem usuário/senha embutidos. A navegação de pagamento existente continua permitindo provedores HTTPS.

O fluxo foi testado em Electron real com 16 perfis, sessões isoladas, cofre bloqueado, link inválido recusado, repetição sem duplicar, Enter no campo de link, carrinhos preservados e criação de uma nova janela para um perfil que já avançou no evento. O teste usa páginas locais fictícias; o carregamento do evento real depende da conexão e do acesso à Meaple.

## Filtros e alertas

Na **Visão geral** da tela Comprar e na lista de **Perfis de navegação**, use a busca pelo nome, o status e a utilização em conjunto. Por exemplo, **Disponíveis / no evento + Não utilizados** mostra somente os perfis que atendem às duas condições. Disponíveis inclui os estados Disponível, Liberado para o evento e Página do evento. **Até 2 minutos (ativos)** mostra prazos positivos de até 120 segundos; expirados aparecem nos demais filtros. A busca ignora maiúsculas e acentos. Os controles das duas telas ficam sincronizados, com contagem dos resultados e botão **Limpar filtros**.

A ordenação inicial é **Menor tempo restante**: carrinhos ainda correndo vêm primeiro, do menor para o maior prazo; depois os expirados e os sem tempo identificado. Em perfis com várias janelas, usa o menor prazo correspondente ao filtro. Pode escolher **Ordem dos perfis**. Os filtros não fecham janelas, não alteram cookies nem mudam o destino de preenchimento. Os seletores de destino continuam contendo todos os perfis/janelas. Se o destino atual ficar oculto na lista, aparece um aviso explícito. **Abrir todos os perfis** continua abrindo todos os cadastrados, inclusive os ocultos por filtros.

O quadro **Avisos de acompanhamento** mostra até 20 avisos recentes, com perfil, janela e horário de Brasília. **Selecionar janela** muda o destino por ação do usuário, sem preencher nem pagar. Janelas fechadas mantêm o registro visual, mas deixam de oferecer esse botão. O acompanhamento usa todas as janelas abertas, independentemente de filtro ou tela atual, inclusive com cofre bloqueado. Não traz janelas para frente automaticamente.

- **Página do evento disponível após a sala de espera**: uma janela antes observada na espera passou a Disponível, Liberado ou Página do evento. Abrir um evento direto não gera aviso de saída da espera. A indicação continua sendo da página reconhecida, sem confirmar autorização no servidor.
- **Últimos dois minutos**: um contador válido, inclusive a regra local de dez minutos em `/orders/`, ficou entre 1 e 120 segundos. O valor exibido no aviso é do momento da emissão; o contador da janela mostra o tempo atual. Não inventa prazo para janela sem contador reconhecido/regra aplicável e não emite um aviso de tempo restante quando já está em zero.

O som começa desligado. Marque **Alertas sonoros** para habilitar o som de aviso do sistema e use **Testar som** para conferir o volume/saída do Windows. Funciona com o programa aberto, inclusive minimizado; não há serviço com aplicativo fechado. Som é opcional: os registros visuais continuam sendo gerados quando desligado. Ativar som não reproduz avisos antigos. Eventos simultâneos próximos são agrupados em um som.

Não repete aviso de liberação para o mesmo evento/janela nesta execução. Não repete aviso de dois minutos para o mesmo pedido/perfil, mesmo em duas janelas do mesmo pedido, ou ao alternar entre leitura do site e contagem local; outras rotas de checkout usam identidade por janela. Pequenas oscilações do contador não rearmam o aviso. **Limpar avisos** remove só os registros visuais, sem rearmar sons. Ao reiniciar, o histórico de avisos e a deduplicação recomeçam: não restaura uma liberação antiga; um contador que já estiver nos últimos dois minutos pode gerar novo aviso.

Filtro, busca, ordenação e preferência de som ficam em `workspace.json`, fora do cofre e sem dados financeiros. A interface informa **Salvando preferências… / Preferências salvas**; espere a confirmação antes de encerrar. Preferências são preservadas ao bloquear o cofre e reiniciar. Falha de gravação mantém as preferências anteriores. Testes usam páginas fictícias e verificam a solicitação nativa de som; a audição física depende da saída e volume do Windows.

## Sala de espera e acesso ao evento

A **Visão geral** da tela Comprar mostra o status de cada janela. **Perfis de navegação**, o seletor de perfil e o seletor de janela também mostram a situação. A leitura é automática, aproximadamente a cada segundo, com janelas em segundo plano e cofre bloqueado. Se um perfil tiver várias janelas, o resumo mostra as quantidades por situação — por exemplo, **1 na sala de espera · 1 liberada para o evento** — sem tratar todas como liberadas.

- **Disponível**: a janela carregou um link de evento da Meaple, como `https://meaple.com.br/808/submundo-808-curitiba-pr`. Rotas `/número-do-organizador/nome-do-evento` são reconhecidas automaticamente. O link informado em **Abrir todos os perfis** também é usado como referência exata, mesmo em outro formato de rota. Parâmetros, fragmentos e barra final não mudam essa referência. Não exige botão de compra reconhecido nem ter passado pela espera. Sala de espera e erro continuam tendo prioridade, mesmo no mesmo endereço. Disponível indica a página do evento aberta; não confirma estoque de ingressos ou autorização de fila no servidor.
- **Na sala de espera**: o título contém Sala de espera, Fila de espera ou Waiting room; também aceita um cabeçalho visível com esses nomes. O título do print do usuário, SUBMUNDO 808 — Sala de espera, é reconhecido.
- **Liberado para o evento**: essa mesma janela foi observada na espera e agora exibe uma página de evento identificável, com cabeçalho e ação de ingresso visíveis. A correspondência usa a mesma rota ou o nome do evento observado no título da espera. Isso é uma indicação da página exibida; não confirma autorização no servidor nem reserva de ingresso.
- **Página do evento**: a página foi reconhecida, mas não houve espera correspondente observada nessa janela. Não se inventa uma passagem pela fila.
- **No checkout**, **Carregando página…**, **Falha ao consultar a página**, **Fora da Meaple** ou **Status não identificado** completam os estados. Em links de evento reconhecidos, a URL permite mostrar Disponível; nas demais rotas, trocar de título sozinho não comprova liberação. Páginas de erro, conteúdo não reconhecido e sites externos não recebem Liberado. Se a janela voltar à sala de espera, o status volta também.

O módulo `queue-status.cjs` apenas lê título, cabeçalhos e ações visíveis da página, em mundo isolado com validação de origem/URL/geração. Não lê cookies ou tokens, não clica, não recarrega a fila, não altera sessões e não consulta APIs. O link informado em Abrir todos os perfis é uma referência em memória durante a execução, sem novo arquivo de configuração. URLs de início, login, sala de espera, checkout e provedores externos não são aceitas como evento de referência. Sinais sem nova leitura por cinco segundos deixam de ser considerados atuais. O status é por janela e fica somente em memória; ao reiniciar é verificado de novo, sem reutilizar uma liberação antiga. A marca Utilizado e o contador do carrinho continuam independentes.

A Meaple real continua sem validação de fila nesta nuvem por bloqueio do proxy. Testes com páginas fictícias cobrem o título fornecido, chegada ao evento, erros, ausência de sinais, retorno à espera, página externa, várias janelas do mesmo perfil e foco dos controles. O formato atual do site pode exigir adaptação; consulte a janela real se o programa não identificar o estado.

## Perfil de navegação utilizado

Depois que o preenchimento automático confirmar ao menos um campo de dados, o **perfil de navegação de destino** recebe **Utilizado**, com data e hora de Brasília. Preenchimentos parciais também contam: confira as pendências exibidas. Apenas selecionar/abrir um perfil, uma tentativa que falhou ou somente recusar seguro não criam essa marca. Ela não confirma pagamento, não desconta limite e não bloqueia novo preenchimento.

A marca aparece na **Visão geral** em todas as janelas daquele perfil, na lista de **Perfis de navegação** e no seletor de perfil da tela Comprar. O horário é atualizado ao preencher novamente. Fica salvo localmente após fechar o aplicativo, em `workspace.json`, sem guardar comprador, CPF ou cartão nessa marca. Funciona com o cofre bloqueado e é independente da utilização do CPF: limpar uma não limpa a outra. Cadastros antigos continuam compatíveis; a marca é criada nos próximos preenchimentos, sem deduzir uso pelo histórico de CPF.

Em **Perfis de navegação → Limpar marcação**, você pode remover o aviso daquele perfil após confirmar. Os demais perfis, os CPFs e o histórico financeiro são preservados. Uma solicitação antiga não apaga uma utilização mais recente; não é possível limpar durante preenchimento do perfil. Se salvar a marca falhar após preencher, o programa avisa que os dados foram preenchidos e a marca não pôde ser salva.

## Tempo restante do carrinho

Ao entrar em `https://meaple.com.br/orders/` ou `/orders/identificador-do-pedido`, a tela **Comprar** inicia automaticamente uma **contagem local de 10 minutos**, mesmo sem contador visível e com o cofre bloqueado. A regra foi informada pelo usuário. O tempo começa na primeira entrada observada pelo programa nesta sessão, usando prazo absoluto: continua nas janelas em segundo plano e após suspensão do computador, sem depender da velocidade da página.

Cada perfil e pedido tem prazo independente. Duas janelas do mesmo perfil com o mesmo pedido compartilham o prazo. Recarregar, trocar parâmetros/hash, avançar para subpáginas do mesmo pedido, fechar/reabrir sua janela ou sair e voltar ao pedido durante a mesma execução não reiniciam os dez minutos. Um identificador de pedido diferente inicia outro prazo. Se a URL for apenas `/orders/`, sem identificador no caminho, ela representa um único pedido por perfil durante essa execução. Os prazos ficam em memória: ao fechar o programa, são descartados. Se um carrinho já existia antes da primeira observação, o tempo real restante pode ser menor; confira na Meaple.

**Tempo do carrinho selecionado** pertence ao perfil e janela indicados acima. A leitura é atualizada aproximadamente a cada segundo em todas as janelas. **Contagem local** aparece na ajuda e na visão geral quando o valor vem da regra dos dez minutos. O destaque fica amarelo a **2 minutos ou menos**, vermelho em zero. O zero não volta a dez minutos ao atualizar. **Selecionar** muda o destino de preenchimento; **Abrir / ver Meaple** traz a janela para frente. Atualizações preservam o foco dos controles.

Se houver contador visível e legível na Meaple, ele tem prioridade. Uma leitura menor também encurta o prazo local para evitar voltar a mostrar um tempo maior quando o contador desaparecer. O leitor aceita `MM:SS`, `HH:MM:SS` e durações em português ligadas ao prazo da compra. Ignora contadores de evento/lote/fila, leituras ocultas, ambíguas ou inválidas. Leituras do site com mais de cinco segundos ou erro são descartadas; a regra local continua disponível em `/orders/`. Em outras rotas sem contador reconhecido, aparece **Tempo não identificado**. Sair de `/orders/` remove a contagem local da janela; o prazo daquele pedido é preservado em memória caso retorne. Fechar uma janela a remove da visão geral. Provedores externos não são inspecionados nem recebem contagem local.

O programa não prolonga a reserva nem confirma expiração ou pagamento no servidor. O checkout real continua sem validação nesta nuvem devido ao bloqueio 403 da Meaple. Testes usam páginas fictícias, incluindo `/orders/` sem contador, navegação SPA, recarga, janelas compartilhando prazo, outro pedido, leitura do site, urgência, expiração e isolamento entre perfis.

## Lote, custos e preparação para revenda

Na tela **Comprar → Ingressos desta compra**, o programa tenta ler evento, ingressos, lotes, quantidades e valores unitários do resumo visível da Meaple. O total identificado no site também pode preencher **Valor total da compra**; um valor editado manualmente é preservado. A leitura ocorre ao abrir/trocar a janela e é atualizada ao preencher, quando não há edição manual. **Ler resumo da Meaple** atualiza os dados e pede confirmação antes de substituir edições. Rascunhos ficam separados por janela e são limpos ao bloquear o cofre. Confira novamente quando modificar o carrinho.

A leitura automática exige um resumo identificável e preços com indicação de unidade ou expressão como `2 x R$ 50,00`. Um preço isolado pode ser subtotal, taxa ou parcela: nesse caso, o valor unitário fica em branco. Dados ocultos, resumos duplicados, anúncios, seguro e parcelas não são usados como ingressos. Quando faltar informação, complete manualmente. **Adicionar ingresso** permite registrar diferentes categorias/lotes no mesmo pedido. Campos incompletos não impedem preencher o formulário ou registrar pagamento; o cadastro ficará sinalizado para revisão.

Os ingressos são salvos no cofre junto da pendência. Após **Registrar pagamento**, a compra aparece em **Ingressos e revenda**. A confirmação repetida não duplica a compra. Pendências, cancelamentos e registros desfeitos ficam fora dessa lista. Compras antigas aparecem com aviso de revisão: use **Conferir ingressos** para completar os dados. A edição preserva o total pago, o limite e os preços de revenda das linhas existentes.

Cada linha mostra valor unitário original, **custo total com taxas** e custo médio por ingresso. O total pago é distribuído proporcionalmente ao valor dos ingressos de cada linha, incluindo taxas, acréscimos ou descontos. O rateio em centavos distribui o arredondamento para que a soma feche no total pago. A média unitária é arredondada; use o custo total para somar. Se todos os ingressos tiverem valor zero, o rateio usa quantidades. Se faltar quantidade ou valor em alguma linha, os custos por grupo ficam como não informados até a revisão.

Salve o **preço de revenda por ingresso**. A receita prevista usa preço × quantidade; o resultado previsto desconta o custo alocado. O resultado considera somente o preço desejado e o custo da compra, sem representar vendas realizadas. Lotes, preços e ingressos ficam dentro do cofre criptografado e permanecem após reiniciar ou migrar PIN.

**Exportar CSV** permite escolher onde salvar a planilha. O arquivo usa separador `;`, valores brasileiros e UTF-8 com BOM para Excel. Inclui evento, categoria, lote, quantidade, custos, pedido e previsão de revenda, sem CPF, comprador ou dados de cartão. O total pago aparece apenas na primeira linha de cada compra para permitir somá-lo sem duplicidade; o custo com taxas aparece por grupo. Dados incompletos recebem **Revisar dados**, sem estimar valores. Textos semelhantes a fórmulas recebem proteção. A planilha organiza os dados para a revenda; anúncios e códigos de acesso permanecem sob controle do usuário.

Os testes usam resumo fictício com múltiplos lotes, taxas, dados ambíguos e parcelas. A leitura no checkout real ainda depende de validação no computador do usuário, pois a Meaple foi bloqueada pelo proxy da nuvem. Ajustes ao HTML real podem ser necessários.

## Limite disponível e histórico

No cadastro, informe o valor que está disponível no banco naquele momento. O aplicativo é um controle local: não consulta o banco, não detecta pagamento automaticamente e não altera o limite bancário. O valor precisa incluir o total pago, taxas e juros, se houver. Em compra parcelada, o total é descontado do disponível, não apenas uma parcela.

O preenchimento cria um registro **Aguardando confirmação**, salvo no cofre. Mesmo se faltar algum campo ou houver falha de preenchimento, nenhum valor é descontado. A pendência pode ser cancelada ou confirmada posteriormente, inclusive após reiniciar o aplicativo. Repetir o preenchimento da mesma pessoa e cartão na mesma janela reaproveita a pendência. Trocar comprador ou cartão mantém registros separados.

**Registrar pagamento** muda a pendência para **Compra paga** e desconta o valor uma única vez. Cliques repetidos no mesmo registro não duplicam o débito. O número do pedido é opcional; se informado, um pedido confirmado com a mesma referência no mesmo cartão é recusado para evitar duplicidade. Antes de uma nova compra, registre ou cancele a pendência anterior.

**Desfazer registro**, no histórico, devolve o valor ao controle uma única vez, mantendo o registro como desfeito. Isso não cancela ou estorna pagamentos no banco. Para ajustar compras externas ou o pagamento da fatura, edite o cartão e informe o **disponível atual**: o programa ajusta o saldo e preserva o histórico, sem descontar novamente compras anteriores. Valores são calculados em centavos inteiros. Saldo projetado negativo é destacado. Cartões com compras pendentes ou confirmadas são preservados para manter o histórico.

## PIN de 4 números e desbloqueio

No aplicativo desktop, novos cofres exigem exatamente quatro dígitos de 0 a 9. Zeros à esquerda são preservados; letras, espaços e PINs com outro comprimento são recusados. Não há PIN padrão. Escolha e confirme seu próprio PIN no programa, sem enviá-lo no chat.

Para atualizar um cofre já existente, entre com a senha anterior. A tela **Contato e ajustes** abrirá a seção **PIN do cofre** para definir e repetir o novo PIN. A troca recriptografa atomicamente os dados com novo salt e nova chave, preservando compradores, cartões, CVVs opcionais, limites e histórico. Se a gravação falhar, o acesso anterior continua válido. Depois da troca, use somente o novo PIN. Também é possível trocá-lo posteriormente nessa seção, com o cofre desbloqueado.

O cofre permanece desbloqueado por até **30 minutos a partir do desbloqueio**, inclusive durante o uso. A atividade e a restauração da sessão não prolongam o prazo. **Bloquear cofre** ou fechar o programa encerra o acesso antes. Ao bloquear, os campos de PIN, dados pessoais e cartões são limpos da interface. Reiniciar o programa exige entrar novamente.

Um PIN de quatro números oferece menos resistência à adivinhação do que uma senha longa. A criptografia AES-GCM e o PBKDF2 com 310.000 iterações continuam ativos. A extensão de navegador mantém sua senha de dez ou mais caracteres e a sessão de 15 minutos; a alteração para PIN/30 minutos é do aplicativo desktop.

## CVV opcional

O CVV só é persistido se o usuário marcar a opção no cadastro do cartão. Ele fica dentro do mesmo cofre AES-GCM dos demais dados e é carregado no formulário de compra após desbloquear. Ao preencher, o campo temporário é limpo; o CVV salvo permanece no cofre para a próxima compra. Desmarque a opção e salve o cartão para removê-lo. Bloquear ou expirar o cofre limpa os dados sensíveis da interface.

Armazenamento local com criptografia reduz exposição em disco, mas não torna o computador imune a malware ou acesso indevido. O PIN do cofre nunca é persistido em texto. A extensão de navegador continua sem salvar CVV; essa opção é específica do aplicativo desktop.

## Última utilização do CPF

Ao solicitar o preenchimento, o CPF é marcado como **Já utilizado**, com data e hora de Brasília, inclusive se houver campos pendentes. A indicação **Utilizado pela última vez em: …** aparece ao selecionar o comprador, e o seletor mostra **JÁ UTILIZADO**. Você também pode marcar a caixa manualmente para registrar uma utilização anterior ou desmarcá-la para corrigir a informação (com confirmação).

A marcação é informativa, como solicitado: não bloqueia o preenchimento e não confirma pagamento. Reutilizar o CPF atualiza o horário. Não consulta o histórico da Meaple nem compras externas ao programa. O controle considera o CPF sem pontuação e é compartilhado por todos os perfis, inclusive compradores duplicados com nomes diferentes. Reiniciar o programa, excluir o comprador, apagar o cofre ou excluir um perfil de navegação não apaga a marcação. Não há sincronização entre computadores.

## Perfis e armazenamento

O cofre utiliza os mesmos módulos da extensão: AES-GCM de 256 bits e chave derivada do PIN com PBKDF2-SHA-256, salt aleatório e 310.000 iterações. Cada gravação usa um IV aleatório novo. O PIN não é persistido em texto; CVV é salvo apenas por opção explícita, dentro do ciphertext. A sessão desbloqueada fica somente na memória do aplicativo por até 30 minutos e é encerrada ao sair.

Os arquivos ficam em `%APPDATA%\Meaple Preenchimento\profiles\profiles.json`. E-mail e telefone são locais; compradores, cartões, CVVs opcionais, limites e histórico financeiro ficam no cofre criptografado. Os perfis de navegação e as últimas utilizações ficam no arquivo adjacente `workspace.json`. Os CPFs são indexados por HMAC com uma chave local aleatória; o arquivo não contém o CPF em texto nem dados de cartão. As marcações não fazem parte do cofre criptografado. Os cookies de cada perfil de navegação ficam em uma partição persistente independente, no diretório de dados do aplicativo, separado do Chrome/Edge. O perfil inicial preserva a sessão da versão 0.1. Excluir um perfil fecha suas janelas e limpa o armazenamento web dele. Estes são perfis próprios do aplicativo; ele não se conecta às janelas de Chrome/Edge já abertas nem importa os perfis existentes desses navegadores. Os perfis da extensão precisam ser cadastrados novamente no programa. Se esquecer o PIN (ou a senha anterior, antes de migrar), será necessário apagar o cofre e cadastrar novos perfis.

Os dados selecionados são enviados somente ao formulário da Meaple quando o usuário pede o preenchimento. O site e seu provedor de pagamento recebem esses dados. Não há servidor de perfis, telemetria ou sincronização do aplicativo.

## Limites da validação

- A versão foi testada em Electron real no Linux e no Windows, com painel, cofre, IPC, navegador próprio e formulário local equivalente aos prints. Inclui criação de 16 perfis, isolamento de cookies e localStorage entre perfis, compartilhamento entre janelas do mesmo perfil, escolha da janela de destino, horário por CPF duplicado, marcação/desmarcação manual, reinício do processo, persistência criptografada, CVV opcional com remoção ao desmarcar, limites, confirmação idempotente de compra, reversão, pendências após reiniciar, limpeza na expiração do cofre e preenchimento sem finalizar compra.
- O workflow `.github/workflows/windows-desktop.yml` testa no Windows e gera o artefato **Submundo-Windows-x64**, com executável e checksum, além dos pacotes de código-fonte e projeto completo. As execuções e os downloads ficam em https://github.com/dfelip007/Sub/actions/workflows/windows-desktop.yml. Escolha a execução bem-sucedida da revisão/versão desejada. Entre no GitHub, abra a seção **Artifacts** no fim da página, baixe o pacote e extraia o ZIP. O teste completo usa Electron antes do empacotamento; o launcher portátil gerado não foi aberto separadamente pela automação.
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

`prepare:app` copia a interface própria de `desktop/app/panel.html`, `panel.css`, `adapter.js`, `tickets.js` e `wallet.js` e os módulos compartilhados de cofre, máscaras, importação e preenchimento de `src/` para `desktop/app/ui/`. A extensão mantém sua interface e sua política de não salvar CVV. O módulo financeiro estende o cofre compartilhado; limites e compras são gravados atomicamente junto dos cartões criptografados. Os módulos copiados ficam em uma pasta gerada e ignorada pelo Git.

Para a validação completa do aplicativo:

```sh
cd /workspace/Sub/desktop
npm run prepare:app
npm run test:app
```

No Linux, o teste precisa de um display gráfico ou Xvfb. Ele serve a demonstração em `127.0.0.1:8080`, abre um diretório temporário de dados e remove os dados fictícios ao terminar. A porta deve estar livre. O modo de demonstração só funciona no executável de desenvolvimento; o programa empacotado permite preencher somente HTTPS da Meaple e seus subdomínios.

Para gerar o executável com ícone e metadados da Submundo, execute em Windows (ou use o workflow Windows do repositório):

```sh
cd /workspace/Sub/desktop
npm run build:win
```

O resultado fica em `desktop/dist/`. A edição dos recursos de ícone do executável usa as ferramentas Windows do electron-builder; o ambiente Linux da nuvem não possui Wine e utiliza o GitHub Actions para essa geração. O comando não publica arquivos. O instalador portátil contém um launcher NSIS de 32 bits e o aplicativo Electron x64; o alvo é Windows de 64 bits. Caches padrão funcionam no Windows. Neste ambiente Linux de arquivos restritos, utilize `XDG_CACHE_HOME=/tmp/sub-desktop-cache`, `ELECTRON_BUILDER_CACHE=/tmp/sub-electron-builder-cache` e a opção `--config.electronDownload.cache=/tmp/sub-electron-cache`.

O download do Electron para testes locais usa `ELECTRON_GET_USE_PROXY=1`, `NODE_USE_ENV_PROXY=1` e `electron_config_cache=/tmp/sub-electron-cache` quando o ambiente fornece proxy. O instalador verifica os checksums oficiais incluídos no pacote Electron. Verificação TLS e de artefatos deve permanecer habilitada.

## Separação entre site e dados locais

A janela do site executa com sandbox, isolamento de contexto e Node desativado, sem preload ou acesso ao armazenamento dos perfis. O preenchimento usa um mundo JavaScript isolado e verifica o destino tanto no processo principal quanto no documento. Somente o painel `app://manager/popup.html` pode chamar o IPC restrito; caminhos de arquivo, canais genéricos e código arbitrário não são aceitos. O painel tem CSP sem conexões de rede. Navegação de pagamento pode abrir páginas HTTPS, mas o preenchimento permanece restrito à Meaple.
