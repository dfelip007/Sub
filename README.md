# Preenchimento rápido — Meaple

Versão 0.2: perfis de compradores e cartões, cofre local com senha e máscaras automáticas de datas.

O **Submundo Compras**, aplicativo independente para Windows, fica em [desktop/README.md](desktop/README.md). A versão desktop 0.6 identifica lotes e preços no resumo do checkout e organiza ingressos, custos e preços de revenda com exportação CSV. Também mostra o tempo do carrinho por janela, tem PIN de 4 números, desbloqueio por até 30 minutos, navegação por telas, vários perfis com sessões independentes, CVV salvo opcionalmente no cofre, limite disponível por cartão e histórico de compras pagas. Também mostra a última utilização de cada CPF, sem precisar da extensão. As instruções abaixo se referem à extensão, que continua sem salvar CVV.

Extensão local para Chrome e Edge. Preenche os dados do comprador, cartão e endereço de cobrança da página aberta e marca **“Não preciso da proteção”**. A compra é finalizada manualmente no site.

## Instalar no seu computador

1. Baixe `checkout-rapido.zip` e extraia a pasta.
2. No Chrome, abra a página de extensões (`chrome://extensions`). No Edge, use `edge://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e escolha a pasta extraída que contém `manifest.json`.
5. Fixe a extensão na barra do navegador, pelo ícone de quebra-cabeça.

Não é necessário instalar Node.js para usar a extensão.

## Usar em cada compra

Na primeira utilização:

1. Crie uma senha para o cofre (pelo menos 10 caracteres). Guarde essa senha: ela é necessária para recuperar os perfis após o bloqueio.
2. Abra **Configurar contato fixo**, informe e-mail e telefone e clique em **Salvar contato**. O contato existente da versão anterior é preservado ao atualizar a mesma extensão.
3. Abra **Cadastrar ou editar comprador**, dê um nome ao perfil (por exemplo, Daniel), informe nome, CPF e nascimento e clique em **Salvar comprador**. Use **Novo** para cadastrar outras pessoas.
4. Abra **Cadastrar ou editar cartão e endereço**, dê um nome ao cartão, informe número, titular, validade e endereço e clique em **Salvar cartão e endereço**. Use **Novo** para cadastrar outros cartões.

Em cada compra, abra a extensão, selecione o comprador e o cartão no painel superior, informe o CVV e escolha as parcelas. Clique em **Preencher página agora**, confira as pendências e finalize manualmente no site. Os perfis são independentes: qualquer comprador pode ser combinado com qualquer cartão. O seletor mostra o nome do cartão e seus quatro últimos dígitos.

**Datas:** digite `01021990` para obter `01/02/1990` e `1230` para obter `12/30`. A importação também aceita `12/2030` e normaliza para `12/30`. Datas impossíveis e validades com mês inválido são rejeitadas. Ao cadastrar ou editar, selecione o perfil, altere os campos e salve; a edição mantém o mesmo perfil. O botão **Excluir** solicita confirmação e remove somente o perfil selecionado.

O cofre permanece desbloqueado por até 15 minutos, inclusive ao fechar e reabrir a janela da extensão. Depois desse período ou ao reiniciar o navegador, informe a senha novamente. **Bloquear agora** encerra a sessão e limpa os dados pessoais e de cartão da interface, mantendo o contato fixo. O CVV é limpo ao trocar de cartão e após preencher a página.

Se esquecer a senha, não há recuperação: **Apagar cofre** pede confirmação e remove os compradores e cartões para permitir um novo cadastro. O contato fixo é preservado.

Para importar dados, abra a seção do comprador e use **Colar dados da compra de uma vez**. É possível importar comprador e cartão juntos e depois salvar cada perfil separadamente.

Modelo para colar, usando apenas dados fictícios neste exemplo:

```text
Nome: Pessoa de Teste
CPF: 000.000.000-00
Nascimento: 01/02/1990
Cartão: 0000000000000000
Titular: PESSOA DE TESTE
Validade: 12/30
CVV: 000
País: Brasil
CEP: 00000-000
Cidade: Cidade Teste
Estado: SP
Rua: Rua de Teste
Número: 123
Parcelas: 1
```

Uma informação por linha, com `:` separando o nome do campo e o valor. E-mail e telefone colados neste bloco são ignorados para manter o contato fixo. O texto colado é apagado depois de importado. Não mantenha dados reais de cartão em arquivos de texto para reutilização.

Dados que ainda não foram salvos em um perfil são descartados ao fechar a janela. Depois do preenchimento, os campos de cartão são limpos da interface; o cartão salvo continua no cofre e pode ser selecionado novamente. Os dados preenchidos permanecem no formulário do site para revisão.

## Atualizar a instalação no Windows

Use `scripts/update-windows.ps1` por copiar e colar no PowerShell. Ele localiza a pasta `Meaple-Preenchimento-*` na Área de Trabalho; se houver mais de uma ou se a pasta tiver sido movida, abre um seletor para escolher a pasta atualmente carregada no navegador. Não remova a extensão nem carregue uma segunda cópia para atualizar: a mesma pasta e o mesmo ID preservam o armazenamento local.

O atualizador verifica SHA-256 do pacote, dos arquivos de origem e do resultado. Arquivos alterados manualmente ou de uma versão desconhecida impedem a atualização antes de qualquer gravação. Uma cópia dos arquivos da extensão fica em `%LOCALAPPDATA%\Meaple-Backups\`. Nenhum dado de perfis é copiado pelo instalador: o armazenamento pertence ao navegador. Depois, use **Recarregar** na extensão em `chrome://extensions` ou `edge://extensions`.

## Compatibilidade e limites

- O motor foi validado com um formulário local equivalente aos prints, em testes automatizados e no Chromium. **O checkout real da Meaple ainda precisa ser validado**: a conexão deste ambiente ao site recebeu HTTP 403 do proxy, e os prints não mostram o HTML dos campos.
- Campos são localizados por rótulos, placeholders e atributos acessíveis. Havendo dois campos igualmente prováveis, a extensão informa a pendência em vez de escolher um deles.
- Campos hospedados dentro de iframes, especialmente os de provedores de pagamento, não são preenchidos por esta versão. A extensão sinaliza a presença de iframe para revisão. A adaptação exige conhecer a integração real do checkout.
- Campos com máscaras ou seletores próprios podem precisar de ajuste. Uma indicação de preenchimento não equivale à aceitação do pagamento pelo site.
- Endereço preenchido automaticamente pelo CEP pode chegar com atraso. Confira o endereço depois de o site terminar a consulta.
- Não remove o tempo limite do carrinho, não contorna CAPTCHA ou filas e não garante reserva dos ingressos.
- Não compra, não envia o formulário e não acessa cartões previamente salvos no navegador.

## Dados e permissões

E-mail e telefone são gravados no armazenamento local do navegador ao clicar em **Salvar contato**. **Apagar contato salvo** remove esses dados. Compradores (nome, CPF e nascimento) e cartões (número, titular, validade e endereço) são gravados em um cofre criptografado no mesmo armazenamento, após salvar o perfil.

A criptografia usa AES-GCM de 256 bits, IV aleatório a cada gravação e chave derivada da senha com PBKDF2-SHA-256, salt aleatório e 310.000 iterações. A senha e o CVV não são salvos. Durante os 15 minutos de desbloqueio, a chave derivada fica em `chrome.storage.session`, em memória e restrita aos contextos confiáveis da extensão; ela é removida ao bloquear e expira mesmo se a janela for fechada. Se o navegador não suportar esse armazenamento, será necessário desbloquear novamente ao reabrir.

Os perfis são locais a este navegador; não há servidor, sincronização, telemetria ou chamadas de rede da extensão. Os dados selecionados são enviados ao formulário da aba ativa quando você solicita o preenchimento. O site e seu provedor de pagamento recebem os dados preenchidos no checkout.

Permissões: `activeTab` para a aba que você aciona, `scripting` para preencher os campos e `storage` para guardar o contato. A interface só permite preenchimento em `meaple.com.br`, seus subdomínios e na demonstração local. Ela não executa automaticamente em todas as páginas.

## Desenvolvimento e testes

Node.js 24 e npm. Use o checkout existente; cada tarefa na nuvem já é isolada, sem necessidade de criar outro worktree.

```sh
cd /workspace/Sub
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
```

Para testar no navegador com dados fictícios:

```sh
npm run demo
```

Abra a página de demonstração servida na porta 8080, caminho `/checkout.html`, no seu computador ou em um navegador com acesso ao mesmo processo. A demonstração não processa pagamentos. Em outro terminal, execute o teste automatizado no Chromium instalado:

```sh
npm run test:browser
```

O teste usa `/usr/bin/chromium`. Para outro caminho, defina `CHROMIUM_PATH`. A demonstração deve estar rodando na porta 8080. O teste verifica preenchimento, seguro, digitação de datas, cofre com WebCrypto nativo, reabertura da interface e bloqueio no navegador. As APIs de armazenamento do Chrome são simuladas no teste da interface; ele não instala a extensão. `npm test` também verifica senha incorreta, adulteração do ciphertext, expiração da sessão, falha de armazenamento, exclusão, perfis independentes e ausência de CVV nos registros salvos. As capturas usam dados fictícios e ficam em `test-results/`, fora do pacote.

O Chromium deste ambiente possui uma política administrativa que bloqueia a instalação de extensões. Portanto, a instalação do pacote no navegador do usuário ainda precisa ser verificada; essa política não foi alterada.

Para gerar o pacote instalável:

```sh
python3 scripts/package.py
python3 scripts/windows_installer.py
```

O ZIP contém apenas `manifest.json`, `README.md` e `src/`; não inclui dependências, testes ou dados de usuários.

O gerador de instaladores cria `scripts/install-windows.ps1` para instalação nova e `scripts/update-windows.ps1` para atualização da versão 0.1. A linha de base em `scripts/baseline-0.1.json.gz` contém somente os arquivos originais da extensão. A geração verifica a reconstrução de cada arquivo e a repetição da atualização antes de produzir o PowerShell.
