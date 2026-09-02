# Environment — Variáveis de ambiente

`cp .env.example .env` e preencha. Tudo é lido do backend (NestJS) via `@nestjs/config`; o frontend usa apenas `NEXT_PUBLIC_API_URL`.

## Gerais

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` / `production` |
| `APP_NAME` | Comercial Ops | Nome exibido |
| `APP_PORT` | `3001` | Porta da API |
| `APP_URL` | `http://localhost:3001` | URL pública da API |
| `WEB_URL` | `http://localhost:3000` | URL pública do front |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api` | Usado pelo frontend p/ consumir a API |

## Banco e Redis

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db?schema=public` |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Redis para BullMQ/Agenda |

## Autenticação

| Variável | Descrição |
| --- | --- |
| `JWT_SECRET` | Chave de assinatura do JWT (trocar em produção) |
| `JWT_EXPIRES_IN` | ex.: `8h` |

## ODVIX

`ODVIX_ENABLED`, `ODVIX_BASE_URL`, `ODVIX_CLIENT_ID`, `ODVIX_CLIENT_TOKEN`, `ODVIX_RATE_LIMIT_PER_MIN`, `ODVIX_TIMEOUT_MS`, `ODVIX_PATH_CLIENTES|PRODUTOS|PEDIDOS|VENDEDORES|ESTOQUE`, `ODVIX_EMPRESA_ID`. Com `ODVIX_ENABLED=false` o sistema roda com dados locais.

## Mercos

`MERCOS_ENABLED`, `MERCOS_BASE_URL`, `MERCOS_COMPANY_TOKEN`, `MERCOS_RATE_LIMIT_PER_MIN`, `MERCOS_TIMEOUT_MS`.

## Sync

`SYNC_FULL_INITIAL` (roda full no boot), `SYNC_INTERVAL_MS` (agendador), `SYNC_PAGE_SIZE`.

## Segurança / Seed

| Variável | Descrição |
| --- | --- |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Primeiro admin (seed). **`/auth/register` é restrito a ADMIN** — o admin inicial só existe via seed |
| `N8N_BASE_URL` / `N8N_API_KEY` / `N8N_WEBHOOK_SECRET` | Integração n8n (secret longo) |
| `LOG_LEVEL` | `info` / `debug` / `warn` |

## Cart / IA (quando aplicável)

`CART_TTL_MINUTES` (30), chaves de IA no backend (`OPENAI_API_KEY`/modelo por env das provider), nunca no frontend.

## Segurança prática

- Nunca commitar `.env` (está no `.gitignore` conforme `.env.example`).
- Rotacionar `JWT_SECRET` e `N8N_WEBHOOK_SECRET` entre ambientes.
- `NEXT_PUBLIC_*` é a única variável exposta ao browser; não colocar secrets nelas.