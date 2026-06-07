# AngelShield

Extensão Chrome para armazenamento local de credenciais com senha criptografada por chave simétrica informada pelo usuário.

## Diretrizes rápidas

- Mantenha a extensão offline-first e sem dependência de backend.
- A `key` do cofre deve permanecer apenas em memória de sessão da extensão.
- Apenas o campo de senha deve permanecer criptografado em repouso.
- Não crie testes automatizados a menos que isso seja solicitado explicitamente.

## Documentação

- Regras funcionais e arquitetura: [docs/overview.md](docs/overview.md)
- Detalhes da criptografia e do formato CSV: [docs/crypto.md](docs/crypto.md)
