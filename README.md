# Comercial Ops

Plataforma de **gestão comercial, CRM, automação de vendas e atendimento via WhatsApp**, integrada ao **ODVIX ERP** e ao **Mercos**, para distribuição/venda de produtos de limpeza.

## Visão do produto

Fluxo ideal: **CAPTAÇÃO DIGITAL → WHATSAPP → IA/CHATBOT → VENDA → PEDIDO → ERP → PÓS-VENDA → RECOMPRA**.

O representante humano entra apenas quando necessário (negociação especial, cliente estratégico, problema no pedido, oportunidade de alto valor).

## Stack

| Camada        | Tecnologia                                      |
| ------------- | ----------------------------------------------- |
| Backend       | NestJS 10 (REST, JWT + scrypt, BullMQ, Agenda)  |
| Frontend      | Next.js 15 (App Router)                         |
| Banco de dados| PostgreSQL (Prisma ORM 6)                       |
| Cache/Fila    | Redis (BullMQ)                                  |
| Infra         | Docker Compose + nginx                          |

## Estrutura

```
.
├── apps/
│   ├── api/          # Backend NestJS
│   │   ├── prisma/   # schema.prisma + seed.ts
│   │   └── src/
│   │       ├── auth/            # login, JWT
│   │       ├── crm/             # customers, products, orders, regions
│   │       ├── dashboard/       # KPIs comerciais
│   │       ├── integrations/    # ODVIX, Mercos, sync, registry
│   │       ├── queue/           # wrapper BullMQ
│   │       ├── settings/        # configurações dinâmicas
│   │       └── users/ health/ common/ prisma/
│   └── web/          # Frontend Next.js
├── packages/
│   └── shared/       # tipos/constantes compartilhadas
├── infra/nginx/      # nginx reverse proxy
└── docker-compose.yml
```

## Integrações

- **ODVIX ERP**: camada desacoplada com client base (retry/rate-limit). Auth via `Client-Id`/`Client-Token`. Os caminhos dos controllers ODVIX são configuráveis via env (`ODVIX_PATH_*`) — não assumimos endpoints fixos.
- **Mercos**: API documentada (`https://docs.mercos.com/`), auth por company token (`Authorization`), endpoints `/v1/clientes`, `/v1/produtos`, `/v2/pedidos`, `/v1/tabelas_preco`, etc.
- **Sync**: motor idempotente (upserts, resolução de identidade por CNPJ/CPF/whatsapp/id externo, balanceamento de fonte por entidade), com scheduler e retry.

## Como rodar localmente

Pré-requisitos: Node 22+, Docker (opcional para Postgres/Redis), npm.

```bash
# 1. Copiar env
cp .env.example .env

# 2. Subir Postgres e Redis (Docker)
docker compose up -d postgres redis

# 3. Backend: instalar deps, gerar cliente Prisma e preparar o banco
cd apps/api
npm install --workspaces=false
npx prisma generate
npx prisma db push          # cria as tabelas
npx ts-node prisma/seed.ts  # admin + região + integrações
npm run start:dev

# 4. Frontend
cd ../web
npm install --workspaces=false
npm run build
npm start                   # http://localhost:3000
```

API em `http://localhost:3001`. Tudo via Docker: `docker compose up --build`.

## Scripts raiz

```bash
npm run dev         # api + web (concurrently)
npm run build       # build api e web
npm run db:migrate  # migrações prisma
npm run db:seed     # seed
npm run infra:up    # docker compose up --build
```

## Notas de ambiente (Windows)

- As workspaces npm são instaladas com `--workspaces=false` para evitar conflitos de symlink (`node_modules/@comercial/*`) comuns no Windows.
- Use `npx prisma@6.1.0 <cmd>` para alinhar version de `prisma` CLI e `@prisma/client`.
- No frontend, use o binário local `node node_modules/next/dist/bin/next build` (evita versão `next` global/Turbopack que pode se resolver pelo `npx`).