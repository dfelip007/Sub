# Submundo Compras — projeto para uso e desenvolvimento

Esta entrega permite usar o aplicativo Windows e analisar, modificar e compilar seu código com outro Codex. Não é necessário ter acesso à conversa que originou o projeto.

## O que abrir

- **Pacote completo:** `executavel/` contém o programa Windows e o guia de primeiro uso; `projeto/` contém este documento e todo o código-fonte.
- **Pacote de código-fonte:** este documento já está na raiz do projeto. É o ZIP mais leve para enviar ao Codex ou importar em um repositório.
- `ENTREGA.json` identifica a versão, o commit e a compilação que gerou o pacote. `INTEGRIDADE-SHA256.json` relaciona os hashes dos arquivos entregues. São gerados no empacotamento, não são cadastros do aplicativo.

O aplicativo desktop está na versão **0.9.0**. A extensão continua na versão **0.2.0**, com recursos e política de cofre diferentes. O `README.md` principal documenta principalmente a extensão; para o programa, comece por [desktop/README.md](desktop/README.md).

## Usar agora no Windows

1. Extraia o ZIP completo. Abra `executavel/Submundo-Compras-0.9.0-Windows-x64.exe` no Windows 10/11 de 64 bits.
2. Crie seu PIN de quatro números. Cadastre contato fixo, compradores e cartões e crie seus perfis de navegação.
3. Faça login na Meaple nas sessões do próprio aplicativo. Confira o destino antes de preencher. O pagamento é finalizado manualmente no site.

Não precisa instalar Node.js, Python, a extensão ou o código-fonte para usar o executável. Cada computador/usuário Windows mantém seus próprios dados. Uma instalação que já possua dados locais os preserva; a entrega não é um comando de limpeza.

O pacote contém código, logo, documentação, testes e arquivos de compilação. Não contém compradores, cartões, CVVs, PIN, e-mail/telefone do remetente, histórico, cookies ou logins. Os dados do usuário ficam separados do programa em `%APPDATA%\Meaple Preenchimento`. Essa pasta não faz parte da entrega.

## Abrir no seu Codex

No Codex com acesso a arquivos, extraia e abra a pasta do projeto que contém `package.json` e `AGENTS.md`. Se a interface aceitar anexos ZIP, use preferencialmente o pacote de código-fonte. No Codex em nuvem conectado ao GitHub, crie um repositório com esses arquivos ou faça um fork do repositório original e selecione a revisão/branch indicada em `ENTREGA.json`.

O código funciona sem histórico Git. Git só é necessário para versionar alterações, usar GitHub Actions ou gerar novos pacotes de entrega com identificação de commit. O ZIP não inclui `.git`, credenciais ou configurações privadas do ambiente que o produziu.

Prompt inicial sugerido:

```text
Este é o projeto Submundo Compras. Leia AGENTS.md, COMECE-AQUI.md,
docs/REQUISITOS-E-DECISOES.md, docs/ARQUITETURA.md e
docs/DESENVOLVIMENTO.md. O produto principal é o desktop Electron em
desktop/, e src/ contém módulos compartilhados com a extensão.
Entenda o fluxo e os testes existentes antes de alterar o código.
Preserve os dados de versões anteriores, o isolamento dos perfis,
a confirmação manual do pagamento e as regras documentadas.
Use apenas dados fictícios nos testes.
Minha alteração solicitada é: [descreva aqui o que deseja mudar].
Implemente, execute os testes pertinentes e explique o resultado.
```

## Executar e modificar o código

Instale **Node.js 24 com npm**. Na pasta do projeto, em PowerShell ou outro terminal:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
cd desktop
npm ci --no-audit --no-fund
npm test
npm run prepare:app
npm run check
```

Para abrir a versão de desenvolvimento, execute `npm start` em `desktop/`. Ela usa o diretório histórico de dados do aplicativo: se você já usa o programa nesse usuário, leia o procedimento com dados fictícios e diretório separado em [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md) antes de experimentar mudanças.

Para o teste completo, execute `npm run test:app` em `desktop/`, com a porta 8080 livre. Ele abre Electron real, usa dados fictícios em diretório temporário e não faz pagamentos. Para gerar seu próprio EXE, execute `npm run build:win` em `desktop/` no Windows; o resultado fica em `desktop/dist/`.

## Roteiro de leitura

| Documento | Conteúdo |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Instruções de trabalho para Codex e outros agentes |
| [docs/REQUISITOS-E-DECISOES.md](docs/REQUISITOS-E-DECISOES.md) | Recursos existentes, decisões do usuário e o que ainda não foi implementado |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Mapa dos módulos, fluxos, armazenamento e fronteiras de acesso |
| [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md) | Instalação, testes, depuração, compilação e novas entregas |
| [desktop/README.md](desktop/README.md) | Manual detalhado de uso do aplicativo |
| [README.md](README.md) | Extensão Chrome/Edge e seus scripts históricos |

O projeto não exige servidor próprio, banco de dados externo, API paga nem token secreto para rodar os testes ou compilar localmente. Precisa de Internet para baixar dependências e acessar os sites. O login de cada usuário nos sites é feito pelo próprio usuário. A logo e os arquivos de marca estão incluídos; esta entrega não altera a declaração de licença existente no projeto.
