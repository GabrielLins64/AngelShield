# Como conectar o AngelShield ao Google Drive

Este guia começa pela criação do projeto no Google Cloud e termina com o primeiro backup. Você fará a configuração uma vez e depois usará os botões do AngelShield para enviar ou buscar versões manualmente.

## Se você já está na pergunta “Que dados você acessará?”

Selecione **Dados do usuário** e continue.

| Opção do Google | O que significa | Para o AngelShield |
| --- | --- | --- |
| **Dados do usuário** | Acessar arquivos da conta Google de uma pessoa, com a autorização dela. | **Escolha esta opção.** O backup será salvo no seu Drive. |
| **Dados do aplicativo** | Acesso por uma conta de serviço, usada por programas em outro tipo de integração. | Não é o caminho usado nesta integração. |

Mesmo que o AngelShield crie sua própria pasta, os arquivos pertencem à sua conta Google. Por isso a escolha é **Dados do usuário**. O Google explica a diferença entre esses tipos de acesso em [Escolher credenciais](https://developers.google.com/workspace/guides/create-credentials).

O assistente está preparando um acesso **OAuth**: é o login em que você escolhe sua conta e permite o acesso ao Drive. Ao final, você precisa de **Client ID** e **Client Secret**. Não é preciso criar uma chave de API (API key): ela não é usada pelo AngelShield.

## 1. Criar ou selecionar o projeto

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) e entre com sua conta Google.
2. No topo da página, clique no seletor de projetos, ao lado do nome do Google Cloud.
3. Se já criou um projeto para o AngelShield, selecione-o e vá para o passo 2 deste guia.
4. Para criar um, clique em **Novo projeto**.
5. Em **Nome do projeto**, digite, por exemplo, `AngelShield`.
6. Se estiver usando Gmail pessoal e aparecer **Sem organização**, mantenha essa opção.
7. Clique em **Criar**, aguarde e selecione o novo projeto no topo da página.

Confira o projeto selecionado antes de continuar: a API e todas as credenciais devem ficar no mesmo projeto. [Instruções do Google para projetos](https://developers.google.com/workspace/guides/create-project).

## 2. Entender o faturamento

**Tente ativar a Drive API sem cadastrar cartão**, seguindo o passo 3. Se o console permitir continuar, você pode pular a configuração de faturamento abaixo. Se a API já estiver ativa e não houver essa exigência, também pode seguir adiante.

Na documentação consultada em **18/10/2026**, o Google informa que o uso padrão da Drive API não tem custo adicional dentro dos limites publicados. Há mudanças de cobrança anunciadas para uso acima desses limites; confira a [página atual de preços e limites da Drive API](https://developers.google.com/workspace/drive/api/guides/limits#pricing) antes de habilitar faturamento.

Se o Google exigir uma conta de faturamento para o seu projeto, ou se você quiser associar uma conta existente:

1. Abra o menu **☰ → Faturamento**.
2. Se já houver uma conta disponível, escolha-a. Caso contrário, clique em **Criar conta de faturamento**.
3. Informe o nome da conta, o país e os dados solicitados pelo Google. Para uso pessoal, escolha **Pessoa física / Individual**, se essa opção aparecer.
4. Revise os dados de pagamento e as condições exibidas antes de confirmar.
5. Em **Faturamento → Meus projetos**, encontre o projeto do AngelShield.
6. No menu de ações do projeto, escolha **Alterar faturamento**, selecione a conta e confirme a associação.

Esses caminhos são descritos pelo Google em [Criar conta de faturamento](https://docs.cloud.google.com/billing/docs/how-to/create-billing-account) e [Associar faturamento a um projeto](https://developers.google.com/workspace/guides/create-project#optional_enable_billing_for_your_cloud_project).

Se quiser acompanhar possíveis gastos, use **Faturamento → Orçamentos e alertas → Criar orçamento**, selecione seu projeto e defina um valor e os avisos por e-mail. Um orçamento do tipo **Somente alertas** avisa sobre gastos, mas **não bloqueia cobranças automaticamente**. [Como funcionam os alertas](https://docs.cloud.google.com/billing/docs/how-to/budgets).

## 3. Ativar a Google Drive API

1. Com o projeto correto selecionado, abra **☰ → APIs e serviços → Biblioteca**.
2. Pesquise por **Google Drive API**.
3. Abra o resultado do Google e clique em **Ativar**.
4. Se aparecer **Gerenciar**, a API já está ativa.
5. Se clicar em **Criar credenciais** e surgir a pergunta sobre os dados, escolha **Dados do usuário**.

Você também pode abrir a [página da Google Drive API na biblioteca](https://console.cloud.google.com/apis/library/drive.googleapis.com). O AngelShield usa somente essa API para o backup. [Como ativar APIs](https://developers.google.com/workspace/guides/enable-apis).

## 4. Preparar a tela de autorização

Essa é a tela que o Google mostrará quando você conectar sua conta ao AngelShield.

1. Abra **☰ → Plataforma de autenticação do Google → Branding**. Em algumas telas, o acesso começa em **APIs e serviços → Tela de permissão OAuth**.
2. Se aparecer **Começar / Get started**, clique nele.
3. Preencha o nome do aplicativo com `AngelShield` e selecione seu e-mail de suporte.
4. Em **Público-alvo / Audience**, escolha **Externo** para usar uma conta Gmail pessoal.
5. Informe seu e-mail de contato, leia as condições exibidas e conclua o cadastro se concordar.
6. Abra **Público-alvo / Audience** e mantenha o aplicativo **Em teste / Testing** para esta configuração inicial.
7. Em **Usuários de teste → Adicionar usuários**, adicione o e-mail da conta cujo Drive você usará. Salve.

Se for usar uma conta de empresa ou escola, a opção **Interno** se limita às contas da organização. A conta escolhida para o Drive precisa estar autorizada pelo público-alvo configurado. [Configuração da tela de autorização](https://developers.google.com/workspace/guides/configure-oauth-consent).

## 5. Escolher a permissão do Drive

1. Na plataforma de autenticação, abra **Acesso a dados / Data Access**.
2. Clique em **Adicionar ou remover escopos**. “Escopo” é o nome usado pelo Google para uma permissão.
3. Pesquise `drive.file` e selecione:

   ```text
   https://www.googleapis.com/auth/drive.file
   ```

4. Clique em **Atualizar**, se aparecer, e depois em **Salvar**.

Essa permissão permite trabalhar com os arquivos criados ou autorizados para o aplicativo. É a permissão usada pelo AngelShield para suas pastas e backups. [Permissões da Drive API](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## 6. Obter Client ID e Client Secret

Se o assistente de **Dados do usuário** já chegou à escolha do tipo de aplicativo, continue nele. Caso contrário, abra **Plataforma de autenticação do Google → Clientes → Criar cliente**. Outro caminho é **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.

O redirecionamento é o endereço que devolve o login para a extensão. Você vai copiá-lo da tela do AngelShield e cadastrá-lo no Google.

1. Em **Tipo de aplicativo**, escolha **Aplicativo da Web**. É o tipo usado pela integração atual do AngelShield.
2. Dê um nome, como `AngelShield neste navegador`.
3. Abra o AngelShield em outra aba, vá a **Configurações → Google Drive** e clique na engrenagem do cabeçalho para abrir **Configurar Integração com Google**.
4. Copie o campo **Redirecionamento para cadastrar no Google Cloud**.
5. Volte ao Google Cloud. Em **URIs de redirecionamento autorizadas**, clique em **Adicionar URI** e cole o endereço inteiro.
6. Para este fluxo, deixe **Origens JavaScript autorizadas** vazio. O endereço copiado pertence ao campo de **redirecionamento**.
7. Clique em **Criar**.
8. Copie o **ID do cliente / Client ID** e o **Segredo do cliente / Client Secret** para os campos correspondentes do AngelShield.

O redirecionamento terá este formato, mas você deve usar o valor real mostrado na sua extensão:

```text
https://<id-da-sua-extensao>.chromiumapp.org/google
```

Copie o Client Secret completo assim que ele for criado: o Google só permite vê-lo ou baixá-lo integralmente nesse momento. Se perdeu esse valor, gere um novo segredo na configuração do cliente. [Como gerenciar clientes e segredos](https://support.google.com/cloud/answer/15549257).

## 7. Salvar e conectar no AngelShield

1. No AngelShield, vá a **Configurações → Google Drive** e clique na engrenagem do cabeçalho. A janela **Configurar Integração com Google** mostra **Como configurar no Google Cloud** antes dos campos; clique nesse título para abrir ou recolher as instruções. Confira:

   | Campo | O que preencher |
   | --- | --- |
   | OAuth Client ID | O ID do cliente criado no passo 6. Geralmente termina em `.apps.googleusercontent.com`. |
   | OAuth Client Secret | O segredo completo do mesmo cliente. |
   | Nome da pasta | Pode manter `AngelShield` ou informar outro nome para seus backups. |

2. Clique em **Salvar configuração**. A janela continua aberta, e **Conectar conta Google** fica habilitado quando Client ID e Client Secret estão salvos.
3. Clique em **Conectar conta Google** nessa mesma janela.
4. Escolha a conta adicionada aos usuários de teste e autorize a permissão solicitada.
5. Confira se o AngelShield mostra **Conectado** com o e-mail esperado.
6. Feche a janela. No card Google Drive, clique em **Exportar para o Drive**, informe a chave do cofre se for solicitada e confirme o envio.

Para alterar as credenciais ou o nome da pasta, clique na engrenagem novamente. Os botões **Conectar conta Google** e **Desconectar conta Google** ficam nessa janela. Para renovar a autorização ou trocar de conta, use **Conectar conta Google**.

O campo **Client Secret** carrega o segredo salvo e funciona como o Client ID: você pode editar, substituir por um novo valor ou apagar e clicar em **Salvar configuração**. Ele permanece mascarado como senha, sem botão para visualizar. Você também pode salvar os dois campos vazios; será preciso configurá-los novamente antes de conectar.

O botão **Limpar cliente OAuth** apaga imediatamente o Client ID, o Client Secret e a autorização Google deste navegador, mantendo o nome da pasta salvo. A limpeza funciona mesmo sem internet. Se deixar **Nome da pasta** vazio ao salvar, o AngelShield usa o nome padrão **AngelShield**.

Ao abrir a página de configurações com credenciais salvas, o AngelShield verifica a autorização de forma assíncrona. O card mostra **Não conectado**, **Validando conexão...** ou **Conectado**. Enquanto a conexão não estiver confirmada, **Importar do Drive** e **Exportar para o Drive** ficam desabilitados; a dica ao passar o cursor orienta a seguir as instruções da engrenagem. Se ainda não autorizou uma conta, abra a engrenagem e clique em **Conectar conta Google**. O teste não abre o login automaticamente; pode renovar o token salvo para confirmar o acesso à conta.

Após confirmar a conexão, o card consulta o histórico da pasta configurada e mostra **Versão no Drive** abaixo de **Versão local**, com número e data. Se não houver backups, mostra **nenhum backup**. Se houver ramificações, informa a quantidade; passe o cursor na versão para ver os números e datas envolvidos. Se a consulta falhar, mostra **indisponível**, com o motivo ao passar o cursor. Essa leitura usa apenas os metadados dos arquivos, sem baixar senhas ou alterar a lista local. A informação também é atualizada ao consultar as versões e após concluir uma importação ou exportação.

O AngelShield procura a pasta criada pelo aplicativo usando exatamente o **Nome da pasta** configurado. Se não encontrar uma, cria a pasta no Meu Drive durante o primeiro envio. Alterar esse campo faz as próximas operações usarem o novo nome; os backups anteriores não são movidos nem renomeados.

Se houver várias pastas do AngelShield com o mesmo nome, renomeie as duplicadas diretamente no Drive ou escolha outro **Nome da pasta**. Para acessar o mesmo histórico em outro navegador, use a mesma conta Google, o mesmo projeto Google Cloud e o mesmo nome de pasta.

Clique em **Importar do Drive** para buscar o histórico e escolher uma versão. Depois, use **Baixar / revisar** na versão desejada para revisar e confirmar a substituição local. Cada operação é manual e pede as confirmações necessárias na UI.

## Se algo não funcionar

| O que apareceu | O que conferir |
| --- | --- |
| “Dados do usuário” ou “Dados do aplicativo” | Escolha **Dados do usuário** e siga pelo cliente OAuth. |
| Só consegui uma chave começando com `AIza` | Essa chave de API não é usada pelo AngelShield. Siga o passo 6 para obter Client ID e Client Secret. |
| Não apareceu o Client Secret | Confira se criou um cliente **Aplicativo da Web**. Se fechou a tela de criação e perdeu o segredo, gere outro na configuração desse cliente. |
| `redirect_uri_mismatch` | Copie novamente o redirecionamento real do AngelShield e salve-o nas URIs autorizadas do mesmo cliente. Confira o final `/google`. |
| A conta não pode acessar o aplicativo em teste | Adicione esse e-mail em **Público-alvo → Usuários de teste** e use a mesma conta no login. |
| O Google pede nova autorização depois de alguns dias | No modo **Em teste**, a autorização com acesso ao Drive e seu token de renovação expiram em sete dias. Clique novamente em **Conectar conta Google**. [Regra do Google para aplicativos em teste](https://support.google.com/cloud/answer/15549945). |
| API desativada ou acesso negado | Confira se a Drive API foi ativada no projeto que contém o Client ID usado no AngelShield. |
| “Operação do Drive desconhecida.” | A página e o processo em segundo plano podem estar executando versões diferentes da extensão. Após atualizar o código, recarregue a extensão em `chrome://extensions` e reabra o gerenciador. O indicador de versão usa o comando de histórico já existente para funcionar também com o processo anterior. |

O salt do cofre continua somente neste navegador. Ele não é enviado ao Drive nem recuperado dos backups. Se você usar um salt local diferente do usado na origem, as senhas importadas resultarão incorretas intencionalmente.
