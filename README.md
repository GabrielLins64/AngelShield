# AngelShield

Extensão compatível com Chrome para gerenciar credenciais localmente, com senha criptografada por chave simétrica, preenchimento assistido e backup manual versionado no Google Drive.

Quando o cofre está trancado, ações pontuais como copiar senha ou preencher um login podem pedir a key apenas para aquela operação, sem destrancar a extensão inteira.

## Como rodar localmente

Este projeto não tem etapa de build. A extensão roda diretamente a partir dos arquivos deste repositório.

### Requisitos

- Google Chrome 116+ ou outro navegador Chromium compatível com extensões Manifest V3 e `chrome.identity`

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

## Atalhos

- `Ctrl+Shift+Y`: abre a caixa de autopreenchimento do AngelShield na aba ativa, quando houver um formulário de login visível na página.
- `Ctrl+L`: na página da extensão, aciona o controle do cofre para destrancar ou trancar, espelhando o botão do cabeçalho.
- `Ctrl+K`: na página da extensão, foca a busca por nome, usuário ou site. A busca ignora acentos; use `Esc` para limpá-la.

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
zip -r angelshield.zip manifest.json src assets README.md AGENTS.md docs
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
mkdir -p dist
zip -r dist/angelshield-0.1.2.zip manifest.json src assets
```

O `manifest.json` deve ficar na raiz do ZIP. A pasta `assets` inclui o logotipo, os ícones e o QR Code Pix. A versão do nome do pacote deve acompanhar a versão do manifesto.

Os arquivos da listagem estão em [store/](store/README.md): ícone de 128 × 128, imagem promocional de 440 × 280 e três capturas de 1280 × 800 com dados fictícios. Eles são enviados nos campos de imagens do painel, separadamente do pacote da extensão.

## Checklist antes de publicar na Chrome Web Store

Antes do primeiro deploy público, revise estes pontos:

1. Conferir os ícones de 16, 32, 48 e 128 pixels em `assets/icons` e suas referências no `manifest.json`
2. Definir versão de release em `manifest.json`
3. Revisar textos de descrição e permissões
4. Conferir e atualizar as imagens da listagem em `store/` quando a interface mudar
5. Declarar corretamente privacidade e uso de dados no painel da Chrome Web Store
6. Testar lock/unlock, export/import CSV e preenchimento automático em sites reais

### Observação importante sobre este projeto

O projeto inclui os ícones e as imagens iniciais da listagem. Antes de enviar à loja, conclua:

- revisão final de UX e textos
- publicação da política de privacidade e conferência das declarações no dashboard

O [site do AngelShield](https://gabriellins64.github.io/angelshield-site/) apresenta a extensão e mantém a [política de privacidade em `/privacidade/`](https://gabriellins64.github.io/angelshield-site/privacidade/), com uma cópia local do texto em [docs/privacy.html](docs/privacy.html). Os textos dos campos de privacidade estão em [store/privacy-fields.txt](store/privacy-fields.txt). Use a URL da política no painel da Chrome Web Store e os endereços da página inicial e da política nos campos correspondentes de Branding do Google Cloud. Mantenha a cópia local e o [repositório do site](https://github.com/GabrielLins64/angelshield-site) alinhados. A versão 0.1.1 remove a permissão `tabs`, que não é necessária para as operações de abas usadas pela extensão. A versão 0.1.2 corrige o acesso à configuração inicial do Google Drive: a engrenagem fica disponível mesmo sem credenciais salvas ou durante o carregamento inicial, enquanto importar e exportar continuam dependendo da conexão validada. Também permite limpar as credenciais OAuth e salvar campos vazios, com o segredo em um campo de senha editável e sem opção de visualizar.

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

## Google Drive

A integração é opcional e fica em **Configurações → Google Drive**. O cofre continua funcionando offline. Conectar a conta, abrir a extensão ou editar credenciais não inicia consultas, uploads ou downloads de backups.

O card mostra **Importar do Drive** e **Exportar para o Drive** empilhados. A engrenagem do cabeçalho abre **Configurar Integração com Google**, com instruções, campos avançados e os botões para conectar ou desconectar a conta. Salve Client ID e Client Secret e clique em **Conectar conta Google** nessa janela.

Ao abrir a página de configurações, o AngelShield valida a conexão em segundo plano se as credenciais estiverem salvas. O status passa por **Não conectado**, **Validando conexão...** e **Conectado**. Importação e exportação ficam desabilitadas até confirmar a conexão; ao passar o cursor, a dica orienta a abrir a engrenagem e seguir as instruções. Após validar a conta, consulta os metadados do histórico na pasta configurada para exibir **Versão no Drive** junto da versão local, com número e data ou **nenhum backup**. Se houver ramificações, o indicador avisa. Essa consulta não baixa o conteúdo dos backups, não sincroniza registros e não abre o login automaticamente.

Na configuração, o **Client Secret** carrega o valor salvo em um campo editável, mascarado como senha e sem opção de visualizar. Você pode substituir o valor ou apagar o campo e salvar para removê-lo, assim como no Client ID. Os campos OAuth podem ser salvos vazios. **Limpar cliente OAuth** remove imediatamente as duas credenciais e os tokens Google deste navegador, mantendo o nome da pasta salvo; remover uma credencial também encerra a autorização local.

### Configuração no Google Cloud

Veja o [guia passo a passo para configurar o Google Cloud](docs/google-drive.md). Ele explica a criação do projeto, quando tratar de faturamento, como ativar a API e onde obter cada credencial.

Se você já está na pergunta **“Que dados você acessará?”**, escolha **Dados do usuário**: o AngelShield precisa da sua autorização para salvar os backups no seu Drive. [Como o Google diferencia os tipos de acesso](https://developers.google.com/workspace/guides/create-credentials).

As escolhas para esta integração são:

| Pergunta ou campo | Escolha |
| --- | --- |
| API | Google Drive API |
| Tipo de dados | **Dados do usuário** |
| Público-alvo para Gmail pessoal | Externo, adicionando sua conta como usuário de teste |
| Tipo de cliente OAuth | **Aplicativo da Web** |
| Permissão do Drive | `drive.file` |
| Credenciais no AngelShield | **Client ID** e **Client Secret** |

Não é preciso criar uma chave de API: a integração usa Client ID, Client Secret e a autorização da sua conta Google.

O redirecionamento mostrado no AngelShield deve ser copiado inteiro para as **URIs de redirecionamento autorizadas** do cliente. Ele termina em `/google`. Se o ID da extensão mudar, atualize esse endereço no Google Cloud.

A conexão utiliza código de autorização com PKCE. O refresh token permanece no armazenamento local da extensão; access tokens ficam na sessão e podem ser renovados durante a validação da conexão ou uma operação manual. A chave do cofre mantém seu mecanismo atual de máscara na sessão e não é usada para armazenar tokens Google.

### Pasta e versões

- O campo **Nome da pasta** define a pasta usada em todas as operações. O padrão é **AngelShield**. O aplicativo procura sua pasta por esse nome e, se não a encontrar, cria uma no Meu Drive durante o primeiro envio. Alterar o nome não renomeia nem move backups anteriores.
- Se houver várias pastas do AngelShield com o mesmo nome, renomeie as duplicadas diretamente no Drive ou configure outro nome no aplicativo.
- Para compartilhar o histórico entre instalações, use a mesma conta, o mesmo projeto Google Cloud e o mesmo **Nome da pasta**.
- **Importar do Drive** abre o histórico para escolher uma versão; **Exportar para o Drive** prepara um envio; **Baixar / revisar** prepara a substituição local da versão escolhida. Envios e substituições exigem confirmação e a chave do cofre, sem destrancamento global implícito.
- Cada alteração efetiva dos registros avança a versão local. Uma importação em lote conta como uma alteração. Somente versões enviadas manualmente geram arquivos, portanto pode haver saltos na numeração.
- Os nomes seguem `angelshield_v13_2026_04_21_<uuid>.csv`. A data usa o fuso local da instalação que publicou, e os metadados guardam o instante em ISO UTC. O UUID distingue revisões concorrentes com o mesmo número.
- Arquivos anteriores são preservados. Downloads confirmados substituem a lista local inteira, incluindo remoções, e mantêm a numeração da cópia escolhida.

### Conflitos e salt

O backup mantém os mesmos campos e a codificação Base64 do CSV. Apenas as senhas são cifradas; nome, usuário, site e dica não são criptografados. **Nenhum salt, chave do cofre ou configuração Google é incluído nos arquivos ou metadados enviados ao Drive.**

O salt é exclusivamente local. Ao baixar ou selecionar uma credencial remota, o `encryptedPassword` é preservado e associado ao salt global atual do navegador. Se esse salt for diferente do usado na origem, a senha resultará incorreta intencionalmente: não há detecção, correção nem migração automática. Configure o salt local manualmente pelo fluxo existente quando quiser compatibilidade; esse fluxo pode recriptografar registros locais e tranca o cofre, como já fazia.

Revisões divergentes de mesmo número são conflitos independentemente da data. Alterações independentes e ramificações também exigem escolha manual. É possível usar a cópia local inteira, uma cópia do Drive ou **Destrancar e mostrar diferenças**. A comparação agrupa entradas somente locais, somente remotas e presentes em ambos com valores diferentes; cada diferença exige uma escolha de inclusão, remoção ou versão da credencial. O resultado publica `max(versões envolvidas) + 1` e atualiza o cofre local com a mesma lista. Se houver várias cópias remotas, escolha no seletor qual comparar ou usar; as demais permanecem no histórico após a resolução.

Trancar o cofre, alterar o salt ou mudar os registros invalida uma revisão aberta. Diferenças descriptografadas são descartadas ao fechar a tela ou trancar o cofre. A sincronização nunca altera o salt ou a máscara da chave de sessão.

Se a rede falhar depois de um envio, **Verificar envio pendente** consulta o ID reservado para descobrir se o arquivo foi salvo. A verificação não aplica nada ao cofre: consulte o histórico para decidir o próximo passo. Se o envio continuar disponível na mesma revisão, tentar novamente usa o mesmo ID para não criar uma duplicata. Publicações concorrentes preservam os arquivos e exigem nova revisão.

O limite por backup é de 10 MiB. Se o service worker reiniciar ou a revisão ficar aberta por mais de 15 minutos, consulte novamente para iniciar outra revisão.

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
