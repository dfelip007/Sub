# Submundo Compras — aplicativo Windows

Aplicativo da Submundo para compras na Meaple, com painel central e vários perfis de navegação, cada um com cookies e login separados. A extensão não é necessária. O pagamento é finalizado manualmente no site.

A marca e a logo Submundo / 808 aparecem no painel e nos ícones do Windows. A imagem foi preparada a partir da logo fornecida na conversa. A Meaple continua sendo o site de compra. A pasta histórica de dados `%APPDATA%\Meaple Preenchimento` e o identificador do aplicativo são mantidos para preservar os cadastros e as sessões das versões anteriores.

## Usar e atualizar

1. Feche a versão anterior e execute `Submundo-Compras-0.3.1-Windows-x64.exe` no Windows 10/11 de 64 bits. O arquivo portátil não exige instalação como administrador. Os dados das versões 0.1/0.2/0.3 permanecem no mesmo diretório: use a senha existente, sem apagar o cofre. Os cartões antigos começam sem limite informado e sem CVV salvo.
2. Desbloqueie o cofre ou crie uma senha no primeiro uso. Em **Contato e ajustes**, salve e-mail e telefone.
3. Em **Compradores**, use **Novo comprador** para cadastrar nome, CPF e nascimento. Em **Cartões**, use **Novo cartão** para cadastrar número, titular, validade, endereço e limite disponível. A gravação de CVV é opcional por cartão: informe o código e marque **Salvar o CVV no cofre deste cartão**.
4. Em **Perfis de navegação**, informe um prefixo e a quantidade (por exemplo, 15) e clique em **Criar perfis**. Você pode manter até 100 perfis, criando até 50 por vez. **Usar este perfil** abre a Meaple na sessão escolhida. Faça login, escolha ingressos e avance ao checkout.
5. Em **Comprar**, confira o perfil e a janela de destino, selecione comprador e cartão e confira a última utilização do CPF. O CVV salvo é carregado após desbloquear; se não estiver salvo, informe-o. Escolha parcelas e, se souber, o valor total. Clique em **Preencher checkout**.
6. Confira os campos, o seguro recusado e o valor na Meaple. Finalize o pagamento manualmente no site.
7. Após o pagamento ser aprovado, clique em **Registrar pagamento**, confira o valor total e confirme. O programa desconta o valor do disponível daquele cartão e grava o histórico.

As telas **Comprar**, **Compradores**, **Cartões**, **Perfis de navegação**, **Histórico de compras** e **Contato e ajustes** ficam na navegação lateral. Os cadastros são editados separadamente da compra. Cartões são identificados pelo nome e pelos quatro últimos dígitos, sem mostrar o número completo nas listas.

**Abrir / ver Meaple** traz a janela selecionada para frente ou abre o site no perfil selecionado. **Nova janela neste perfil** compartilha o login do mesmo perfil. Outros perfis usam cookies separados e continuam abertos; escolha o destino antes de preencher. O programa preenche uma janela por vez, pelo botão. O menu **Aplicativo** permite voltar ou recarregar. Ao fechar o painel, o aplicativo é encerrado. Nascimento e validade recebem as barras automaticamente durante a digitação e a importação.

## Limite disponível e histórico

No cadastro, informe o valor que está disponível no banco naquele momento. O aplicativo é um controle local: não consulta o banco, não detecta pagamento automaticamente e não altera o limite bancário. O valor precisa incluir o total pago, taxas e juros, se houver. Em compra parcelada, o total é descontado do disponível, não apenas uma parcela.

O preenchimento cria um registro **Aguardando confirmação**, salvo no cofre. Mesmo se faltar algum campo ou houver falha de preenchimento, nenhum valor é descontado. A pendência pode ser cancelada ou confirmada posteriormente, inclusive após reiniciar o aplicativo. Repetir o preenchimento da mesma pessoa e cartão na mesma janela reaproveita a pendência. Trocar comprador ou cartão mantém registros separados.

**Registrar pagamento** muda a pendência para **Compra paga** e desconta o valor uma única vez. Cliques repetidos no mesmo registro não duplicam o débito. O número do pedido é opcional; se informado, um pedido confirmado com a mesma referência no mesmo cartão é recusado para evitar duplicidade. Antes de uma nova compra, registre ou cancele a pendência anterior.

**Desfazer registro**, no histórico, devolve o valor ao controle uma única vez, mantendo o registro como desfeito. Isso não cancela ou estorna pagamentos no banco. Para ajustar compras externas ou o pagamento da fatura, edite o cartão e informe o **disponível atual**: o programa ajusta o saldo e preserva o histórico, sem descontar novamente compras anteriores. Valores são calculados em centavos inteiros. Saldo projetado negativo é destacado. Cartões com compras pendentes ou confirmadas são preservados para manter o histórico.

## CVV opcional

O CVV só é persistido se o usuário marcar a opção no cadastro do cartão. Ele fica dentro do mesmo cofre AES-GCM dos demais dados e é carregado no formulário de compra após desbloquear. Ao preencher, o campo temporário é limpo; o CVV salvo permanece no cofre para a próxima compra. Desmarque a opção e salve o cartão para removê-lo. Bloquear ou expirar o cofre limpa os dados sensíveis da interface.

Armazenamento local com criptografia reduz exposição em disco, mas não torna o computador imune a malware ou acesso indevido. A senha do cofre nunca é persistida. A extensão de navegador continua sem salvar CVV; essa opção é específica do aplicativo desktop.

## Última utilização do CPF

Ao solicitar o preenchimento, o CPF é marcado como **Já utilizado**, com data e hora de Brasília, inclusive se houver campos pendentes. A indicação **Utilizado pela última vez em: …** aparece ao selecionar o comprador, e o seletor mostra **JÁ UTILIZADO**. Você também pode marcar a caixa manualmente para registrar uma utilização anterior ou desmarcá-la para corrigir a informação (com confirmação).

A marcação é informativa, como solicitado: não bloqueia o preenchimento e não confirma pagamento. Reutilizar o CPF atualiza o horário. Não consulta o histórico da Meaple nem compras externas ao programa. O controle considera o CPF sem pontuação e é compartilhado por todos os perfis, inclusive compradores duplicados com nomes diferentes. Reiniciar o programa, excluir o comprador, apagar o cofre ou excluir um perfil de navegação não apaga a marcação. Não há sincronização entre computadores.

## Perfis e armazenamento

O cofre utiliza os mesmos módulos da extensão: AES-GCM de 256 bits e chave derivada da senha com PBKDF2-SHA-256, salt aleatório e 310.000 iterações. Cada gravação usa um IV aleatório novo. A senha não é persistida; CVV é salvo apenas por opção explícita, dentro do ciphertext. A sessão desbloqueada fica somente na memória do aplicativo por até 15 minutos e é encerrada ao sair.

Os arquivos ficam em `%APPDATA%\Meaple Preenchimento\profiles\profiles.json`. E-mail e telefone são locais; compradores, cartões, CVVs opcionais, limites e histórico financeiro ficam no cofre criptografado. Os perfis de navegação e as últimas utilizações ficam no arquivo adjacente `workspace.json`. Os CPFs são indexados por HMAC com uma chave local aleatória; o arquivo não contém o CPF em texto nem dados de cartão. As marcações não fazem parte do cofre criptografado. Os cookies de cada perfil de navegação ficam em uma partição persistente independente, no diretório de dados do aplicativo, separado do Chrome/Edge. O perfil inicial preserva a sessão da versão 0.1. Excluir um perfil fecha suas janelas e limpa o armazenamento web dele. Estes são perfis próprios do aplicativo; ele não se conecta às janelas de Chrome/Edge já abertas nem importa os perfis existentes desses navegadores. Os perfis da extensão precisam ser cadastrados novamente no programa. Se esquecer a senha, será necessário apagar o cofre e cadastrar novos perfis.

Os dados selecionados são enviados somente ao formulário da Meaple quando o usuário pede o preenchimento. O site e seu provedor de pagamento recebem esses dados. Não há servidor de perfis, telemetria ou sincronização do aplicativo.

## Limites da validação

- A versão foi testada em Electron real no Linux e no Windows, com painel, cofre, IPC, navegador próprio e formulário local equivalente aos prints. Inclui criação de 16 perfis, isolamento de cookies e localStorage entre perfis, compartilhamento entre janelas do mesmo perfil, escolha da janela de destino, horário por CPF duplicado, marcação/desmarcação manual, reinício do processo, persistência criptografada, CVV opcional com remoção ao desmarcar, limites, confirmação idempotente de compra, reversão, pendências após reiniciar, limpeza na expiração do cofre e preenchimento sem finalizar compra.
- O workflow `.github/workflows/windows-desktop.yml` passou no Windows e gerou o artefato **Submundo-Windows-x64**, com executável e checksum. As execuções e os downloads ficam em https://github.com/dfelip007/Sub/actions/workflows/windows-desktop.yml. Escolha a execução bem-sucedida mais recente da versão 0.3.1. Entre no GitHub, abra a seção **Artifacts** no fim da página, baixe o pacote e extraia o ZIP. O teste completo usa Electron antes do empacotamento; o launcher portátil gerado não foi aberto separadamente pela automação.
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

`prepare:app` copia a interface própria de `desktop/app/panel.html`, `panel.css`, `adapter.js` e `wallet.js` e os módulos compartilhados de cofre, máscaras, importação e preenchimento de `src/` para `desktop/app/ui/`. A extensão mantém sua interface e sua política de não salvar CVV. O módulo financeiro estende o cofre compartilhado; limites e compras são gravados atomicamente junto dos cartões criptografados. Os módulos copiados ficam em uma pasta gerada e ignorada pelo Git.

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
