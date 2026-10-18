# Criptografia e CSV

## Algoritmo

O fluxo de cifra funciona assim:

1. A key informada é quebrada por espaços.
2. Cada parte recebe um salt.
3. Cada item é transformado em hash hexadecimal com `blake2b`.
4. A senha é cifrada caractere a caractere usando um alfabeto controlado e soma modular.
5. Na descriptografia, a ordem das subkeys é invertida.

## Charset suportado

O alfabeto da cifra inclui:

- ASCII imprimível (`32..126`)
- Caracteres acentuados suportados pela cifra
- Quebra de linha e tab

Senhas fora desse conjunto são rejeitadas no momento da criptografia para evitar dados irrecuperáveis.

## Salt global

- O projeto mantém um salt padrão configurável.
- Cada registro persiste o salt usado na sua última criptografia.
- Ao alterar o salt global, o AngelShield recriptografa todos os registros existentes usando a key informada ou recuperada da sessão. Depois, remove a key de sessão e tranca o cofre, mesmo que não existam registros.
- Na importação por CSV, o salt do programa é sempre o `salt global` atualmente configurado.

Essa abordagem preserva portabilidade no CSV sem perder a noção de um salt padrão do cofre.

## Key na sessão

- Ao destrancar o cofre, a key é mascarada com AES-GCM via Web Crypto antes de ser salva em `chrome.storage.session`.
- A chave da máscara é derivada com SHA-256 do salt global e de um prefixo específico deste formato. Cada gravação usa um IV aleatório de 12 bytes.
- O valor salvo contém `version`, `iv` e `ciphertext`; IV e conteúdo cifrado são representados em Base64. A key original só é recuperada internamente pelo service worker e não é salva em texto puro.
- A recuperação usa o salt global atual, sem guardar uma cópia do salt anterior junto da máscara. Reiniciar o service worker mantém o destrancamento na mesma sessão, desde que o salt não mude. Alterar o salt remove a máscara e exige destrancar o cofre novamente.
- Valores antigos em texto puro são migrados na inicialização, antes de processar mensagens. Se a máscara estiver inválida ou corrompida, a key de sessão é removida e o cofre volta a ficar trancado.
- Trancar o cofre remove a máscara da sessão. A key não é persistida em `chrome.storage.local` nem exportada no CSV.

Esta camada é ofuscação contra leitura direta do storage. Como o salt e o algoritmo estão disponíveis na extensão, alguém com acesso a esses dados ainda pode reverter a máscara. Ela não adiciona um segredo independente nem substitui a criptografia das senhas dos registros.

## CSV

- O CSV exporta `id`, `identifier`, `username`, `link`, `encryptedPassword` e `hint`.
- Cada célula textual é exportada em Base64 para evitar conflitos com vírgulas, quebras de linha e caracteres especiais.
- A importação faz upsert por `id`. Se o `id` vier vazio, um novo identificador interno é gerado.
- A importação aceita `encryptedPassword` ou `password`.
- Se o CSV trouxer `password` em texto puro, a extensão solicita a key do cofre para criptografar a senha durante a importação.
- Se o CSV trouxer `encryptedPassword`, a leitura assume o `salt global` atualmente configurado no cofre.
- Para `encryptedPassword`, o `salt global` configurado no cofre de destino deve ser compatível com o usado na origem.
