# Visão geral

## Objetivo

O AngelShield é uma extensão compatível com Chrome que mantém um cofre local de credenciais e ajuda o usuário a preencher usuário e senha em páginas com formulários de login.

## Funcionalidades

- Cadastro, edição e remoção de registros com `identificador`, `usuário`, `link`, `senha` e `dica`.
- Abertura de uma página de gerenciamento ao clicar no ícone da extensão.
- Atalho `Ctrl+Shift+Y` para abrir a caixa de autopreenchimento na aba ativa.
- Atalho `Ctrl+L` na página da extensão para acionar o fluxo de trancar ou destrancar o cofre.
- Estado de `trancado` e `destrancado`, com a key guardada apenas em memória de sessão.
- Preenchimento assistido em páginas com inputs de usuário e senha.
- Cópia de usuário e senha pela tela da extensão.
- Busca de registros por identificador ou usuário.
- Paginação da lista de registros quando houver mais de 10 itens, com opção de exibir 10, 50, 100 ou todos.
- Alteração do salt padrão com migração das senhas já armazenadas.
- Exportação e importação de registros por CSV, com suporte a senha criptografada ou em texto puro.

## Arquitetura

- `manifest.json`: define permissões, service worker, content script e páginas da extensão.
- `src/background/service-worker.js`: coordena armazenamento, lock/unlock, criptografia, CSV e abertura da tela de gerenciamento.
- `src/content/*`: identifica campos de login e injeta um gatilho visual para preencher credenciais.
- `src/manager/*`: página principal da extensão para gestão do cofre.
- `src/lib/*`: utilidades compartilhadas, incluindo a implementação do algoritmo de criptografia.

## Armazenamento

- `chrome.storage.local`: registros e configuração persistente.
- `chrome.storage.session`: key do cofre, mantida apenas durante a sessão do navegador/extensão.

## Observações de UX

- A extensão não valida se a key está correta.
- Se o cofre estiver trancado, ações pontuais como copiar senha ou preencher login podem solicitar a key sem destrancar o cofre inteiro.
- O destrancamento global só acontece quando o usuário escolhe destrancar explicitamente a extensão.
- O preenchimento automático prioriza registros cujo link combina com a página atual.
