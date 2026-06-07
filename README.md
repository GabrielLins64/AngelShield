# AngelShield

Extensão compatível com Chrome para gerenciar credenciais localmente, com senha criptografada por chave simétrica e preenchimento assistido em formulários de login.

Quando o cofre está trancado, ações pontuais como copiar senha ou preencher um login podem pedir a key apenas para aquela operação, sem destrancar a extensão inteira.

## Como rodar localmente

Este projeto não tem etapa de build. A extensão roda diretamente a partir dos arquivos deste repositório.

### Requisitos

- Google Chrome ou outro navegador Chromium compatível com extensões Manifest V3

### Passo a passo

1. Abra o Chrome em `chrome://extensions/`
2. Ative o modo de desenvolvedor
3. Clique em `Load unpacked` / `Carregar sem compactação`
4. Selecione a pasta raiz deste projeto:

```text
angelshield/
```

5. A extensão `AngelShield` aparecerá na lista e já poderá ser usada
6. Clique no ícone da extensão para abrir a tela de gerenciamento

### Fluxo de desenvolvimento

Como a extensão é carregada sem compactação, qualquer alteração em arquivos como `manifest.json`, `src/background/*`, `src/content/*` ou `src/manager/*` exige recarregar a extensão na tela `chrome://extensions/`.

Em geral o fluxo é:

1. Editar os arquivos
2. Ir para `chrome://extensions/`
3. Clicar em `Reload` / `Recarregar` na extensão
4. Atualizar a aba do site onde você quer testar o autofill

## Estrutura útil

```text
manifest.json
src/background/service-worker.js
src/content/content-script.js
src/manager/manager.html
src/lib/crypto.js
```

## Como empacotar para distribuir

### Opção 1: compartilhar para instalação local de desenvolvimento

Para outro desenvolvedor testar localmente, basta enviar a pasta do projeto ou um `.zip` com os arquivos da extensão. A pessoa vai extrair o conteúdo e usar `Load unpacked`.

Exemplo de empacotamento:

```bash
zip -r angelshield.zip manifest.json src README.md AGENTS.md docs
```

Observação:

- Esse `.zip` não instala a extensão diretamente no Chrome do usuário final
- Ele serve para compartilhar os arquivos-fonte da extensão
- A instalação manual continua sendo por `Load unpacked`

### Opção 2: publicação para usuários finais

Para usuários finais instalarem de forma oficial e simples, o caminho recomendado é a **Chrome Web Store**.

De forma geral:

1. Garanta que a extensão está pronta para release
2. Gere um `.zip` contendo a extensão
3. Envie o `.zip` no Chrome Developer Dashboard
4. Preencha os dados da listagem
5. Envie para revisão
6. Após aprovação, publique

Exemplo de `.zip` para upload:

```bash
zip -r angelshield-store.zip manifest.json src
```

## Checklist antes de publicar na Chrome Web Store

Antes do primeiro deploy público, revise estes pontos:

1. Adicionar ícones da extensão e a chave `icons` no `manifest.json`
2. Definir versão de release em `manifest.json`
3. Revisar textos de descrição e permissões
4. Preparar imagens da listagem da loja
5. Declarar corretamente privacidade e uso de dados no painel da Chrome Web Store
6. Testar lock/unlock, export/import CSV e preenchimento automático em sites reais

### Observação importante sobre este projeto

O projeto atual já funciona para desenvolvimento local, mas para publicação na loja você provavelmente vai querer complementar pelo menos:

- ícones da extensão
- assets da listagem
- revisão final de UX e textos
- conferência das declarações de privacidade no dashboard

## Formato de CSV

O AngelShield exporta CSV com estes campos:

```text
id,identifier,username,link,encryptedPassword,hint
```

Na importação, a extensão aceita dois formatos de senha:

1. `encryptedPassword`
2. `password`

Regras importantes:

- `password` pode ser usado para importar senhas em texto puro
- quando o CSV usa `password`, a extensão pede a key para criptografar essas senhas durante a importação
- o CSV não usa campo `salt`
- a importação sempre utiliza o `salt global` atualmente configurado na extensão
- se o CSV usa `encryptedPassword`, o `salt global` da extensão de destino precisa ser compatível com o usado na origem

## Processo sugerido de release

### Primeira publicação

1. Atualize a versão em `manifest.json`
2. Gere o pacote `.zip`
3. Envie no Chrome Developer Dashboard
4. Complete as abas de listagem, privacidade, distribuição e instruções de teste se necessário
5. Submeta para revisão

### Atualizações futuras

1. Faça as alterações no código
2. Atualize a versão em `manifest.json`
3. Gere um novo `.zip`
4. Envie a nova versão no dashboard da Chrome Web Store
5. Publique após a revisão

## Distribuição fora da Chrome Web Store

Para usuários comuns, a distribuição oficial é pela Chrome Web Store.

Distribuição fora da loja é limitada e normalmente se aplica a:

- ambientes corporativos gerenciados por políticas
- cenários específicos em Linux
- uso interno de desenvolvimento com `Load unpacked`

Se o objetivo for instalação simples para outras pessoas sem conhecimento técnico, publique na loja.

## Links oficiais

- Carregar extensão sem compactação: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world
- Distribuição de extensões: https://developer.chrome.com/docs/extensions/mv3/hosting
- Publicação na Chrome Web Store: https://developer.chrome.com/docs/webstore/publish
