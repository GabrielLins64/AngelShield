# Visão geral

## Objetivo

O AngelShield é uma extensão compatível com Chrome que mantém um cofre local de credenciais e ajuda o usuário a preencher usuário e senha em páginas com formulários de login.

## Funcionalidades

- Cadastro, edição e remoção de registros com `identificador`, `usuário`, `link`, `senha` e `dica`.
- Abertura de uma página de gerenciamento ao clicar no ícone da extensão.
- Atalho `Ctrl+Shift+Y` para abrir a caixa de autopreenchimento na aba ativa.
- Atalho `Ctrl+L` na página da extensão para acionar o fluxo de trancar ou destrancar o cofre.
- Atalho `Ctrl+K` para focar a busca na página de gerenciamento; `Esc` limpa uma busca em andamento.
- Estado de `trancado` e `destrancado`, com a key guardada apenas em memória de sessão.
- Preenchimento assistido em páginas com inputs de usuário e senha.
- Cópia de usuário e senha pela tela da extensão.
- Busca de registros por identificador, usuário ou site, sem diferenciar maiúsculas e acentos.
- Paginação com páginas numeradas e opção de exibir 10, 50, 100 ou todos. A busca e a troca de quantidade retornam à primeira página, e exclusões ajustam a página atual aos resultados restantes.
- Alteração do salt padrão com migração das senhas já armazenadas, remoção da key de sessão e trancamento automático do cofre.
- Exportação e importação de registros por CSV, com suporte a senha criptografada ou em texto puro.
- OAuth Google configurável pela UI, com conexão persistente e escopo `drive.file`.
- Backup manual versionado em pastas do aplicativo no Drive, com histórico imutável e resolução de conflitos por credencial.

## Arquitetura

- `manifest.json`: define permissões, service worker, content script e páginas da extensão. O campo `key` mantém a chave pública da Chrome Web Store para fixar o ID `ppegkiaeakaakopooipcllfjcefnbhff` também nas instalações de desenvolvimento.
- `src/background/service-worker.js`: coordena armazenamento, lock/unlock, criptografia, CSV e abertura da tela de gerenciamento.
- `src/background/google-drive.js`: OAuth com PKCE, configuração e tokens Google, pastas e API REST do Drive.
- `src/background/drive-sync.js`: revisões manuais, detecção de ramificações, confirmação de operações, mesclagem e recuperação de envios incertos.
- `src/lib/vault-sync.js`: seleção explícita dos campos portáveis, CSV de backup e comparação das credenciais.
- `src/content/*`: identifica campos de login e injeta um gatilho visual para preencher credenciais.
- `src/manager/*`: página principal da extensão para gestão do cofre.
- `src/lib/*`: utilidades compartilhadas, incluindo a implementação do algoritmo de criptografia.

## Armazenamento

- `chrome.storage.local`: registros e configuração persistente.
- `chrome.storage.session`: key do cofre mascarada de forma reversível com o salt, mantida apenas durante a sessão do navegador/extensão. A forma original é recuperada internamente pelo service worker.
- Acesso ao armazenamento local restrito aos contextos confiáveis da extensão. Content scripts usam mensagens, sem acesso direto às configurações Google.
- Metadados de revisão, base sincronizada, credenciais Google e refresh token ficam em chaves locais separadas. Access tokens ficam na sessão. Segredos Google não integram o dashboard comum, CSV ou backups.
- Operações de Drive são aceitas somente da página de gerenciamento, depois da inicialização/migração do storage. Alterações locais e operações de sincronização são serializadas; trancar o cofre permanece imediato e invalida revisões abertas.

## Sincronização

Para configurar a conta Google desde o início, siga o [guia simples do Google Cloud](google-drive.md), incluindo a escolha **Dados do usuário**, faturamento e criação de Client ID e Client Secret.

- Ao abrir a página de configurações com credenciais salvas, uma validação assíncrona consulta a conta autorizada e pode renovar seu token. Após confirmar a conexão, consulta apenas os metadados do histórico da pasta configurada para mostrar **Versão no Drive** junto da versão local, incluindo número, data e eventual ramificação. Não abre OAuth interativo, cria pastas, baixa o conteúdo de backups nem importa ou exporta registros. Não há polling, agenda ou sincronização acionada por alterações nos registros; o conteúdo dos backups só é lido ou escrito por uma operação manual.
- Cada alteração efetiva dos registros incrementa a revisão local. Registros e revisão são gravados juntos. Downloads preservam a revisão selecionada; resoluções criam uma nova revisão acima das envolvidas.
- O CSV remoto contém somente os seis campos de exportação, sem salt. Ao importar, usa-se o salt local atual deliberadamente, sem validação de compatibilidade ou recriptografia.
- Relações entre revisões publicadas identificam ramificações, mesmo com números diferentes. Datas não decidem qual cópia vence.
- Revisões abertas expiram em 15 minutos ou ao reiniciar o worker; mudanças locais, de salt, de conta/pasta ou de histórico remoto exigem nova revisão.
- Uploads usam IDs pré-gerados. Um envio de resultado incerto mantém apenas CSV cifrado e metadados locais para verificação manual; nenhum salt ou chave é incluído nessa cópia pendente.

## Observações de UX

- A página de gerenciamento tem navegação para cofre, gerador e configurações, com layout adaptado a telas menores.
- As configurações têm página própria em `manager.html#settings`, com acesso pela navegação e retorno ao cofre em `#vault`. Alternar entre as páginas mantém a busca e a paginação do cofre; os botões de voltar e avançar do navegador também funcionam.
- A configuração de criptografia fica no topo. Abaixo, os cards Google Drive (**BACKUP NA NUVEM**) e Arquivo CSV (**BACKUP MANUAL**) ficam lado a lado em telas maiores, com a mesma altura e botões empilhados e alinhados entre as colunas. Cabeçalhos, descrições e espaçamentos seguem o mesmo padrão. A altura acompanha o conteúdo do maior card. Em telas menores, os cards são empilhados.
- O card Google Drive tem **Importar do Drive** e **Exportar para o Drive** empilhados, além de uma engrenagem e do status de conexão no cabeçalho. A engrenagem fica disponível mesmo sem credenciais salvas ou enquanto a configuração inicial é carregada; abre as instruções recolhíveis antes dos campos avançados e concentra as ações de conectar e desconectar a conta. O status distingue **Não conectado**, **Validando conexão...** e **Conectado**; os botões principais ficam bloqueados nos dois primeiros estados, com dica de configuração ao passar o cursor ou focar pelo teclado. As versões e as informações de CSV começam logo abaixo dos botões, com o mesmo divisor e espaçamento nos dois cards.
- O estado do cofre e a ação de trancar/destrancar ficam visíveis no cabeçalho.
- A configuração Google aceita credenciais vazias. Ao abrir a janela, uma leitura restrita ao gerenciador carrega o Client Secret salvo em um campo de senha editável e sem opção de visualizar. O valor pode ser substituído ou apagado e salvo; o campo é esvaziado ao fechar a janela. Atualizações do status não sobrescrevem a edição. **Limpar cliente OAuth** remove imediatamente Client ID, Client Secret e tokens locais, preservando o nome da pasta. Remover qualquer credencial também encerra a autorização local.
- Ao lado do controle do cofre, um coração pulsa e brilha para abrir o modal de apoio ao projeto, com uma mensagem curta e o QR Code Pix local. O modal pode ser fechado pelo botão, pela tecla Escape ou pelo fundo; a animação respeita a preferência de movimento reduzido.
- O seletor de quantidade por página permanece disponível durante a busca, mesmo sem resultados.
- Ao salvar uma credencial, a lista abre a página correspondente e foca o registro salvo. Se a busca ocultar esse registro, ela é limpa.
- A exclusão exige confirmação com o nome da credencial. Cancelar a solicitação de chave mantém o formulário preenchido.
- O gerador cria uma senha ao abrir e atualiza a senha quando as opções mudam.
- A extensão não valida se a key está correta.
- Se o cofre estiver trancado, ações pontuais como copiar senha ou preencher login podem solicitar a key sem destrancar o cofre inteiro.
- O destrancamento global só acontece quando o usuário escolhe destrancar explicitamente a extensão.
- O preenchimento automático prioriza registros cujo link combina com a página atual.
