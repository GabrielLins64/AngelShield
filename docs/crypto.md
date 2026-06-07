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
- Ao alterar o salt global, o AngelShield recriptografa todos os registros existentes usando a key atualmente em memória.
- Na importação por CSV, o salt do programa é sempre o `salt global` atualmente configurado.

Essa abordagem preserva portabilidade no CSV sem perder a noção de um salt padrão do cofre.

## CSV

- O CSV exporta `id`, `identifier`, `username`, `link`, `encryptedPassword` e `hint`.
- Cada célula textual é exportada em Base64 para evitar conflitos com vírgulas, quebras de linha e caracteres especiais.
- A importação faz upsert por `id`. Se o `id` vier vazio, um novo identificador interno é gerado.
- A importação aceita `encryptedPassword` ou `password`.
- Se o CSV trouxer `password` em texto puro, a extensão solicita a key do cofre para criptografar a senha durante a importação.
- Se o CSV trouxer `encryptedPassword`, a leitura assume o `salt global` atualmente configurado no cofre.
- Para `encryptedPassword`, o `salt global` configurado no cofre de destino deve ser compatível com o usado na origem.
