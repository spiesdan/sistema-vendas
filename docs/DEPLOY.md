# Deploy

## Topologia

```
                  ┌────────────┐
  Internet ─────► │   nginx    │──► /api* → api:3001
                  │  :80/:443  │──► /*    → web:3000
                  └────────────┘
```

Todos os componentes sobem com Docker Compose:

- `postgres:16-alpine` (volume persistente, healthcheck)
- `redis:7-alpine` (appendonly, volume persistente)
- `api` (NestJS via `apps/api/Dockerfile`, expõe `3001`) — depende do postgres/redis saudáveis
- `web` (Next.js via `apps/web/Dockerfile`, expõe `3000`) — `NEXT_PUBLIC_API_URL=http://localhost:3001`
- `nginx:1.27-alpine` (conf em `infra/nginx/`, certs opcional em `infra/nginx/certs`)

## Subir

```bash
# Copie/config o .env
cp .env.example .env

# Tudo
docker compose up --build -d

# Ou somente infra para dev
docker compose up -d postgres redis
```

## Migrações no container

```bash
docker compose run --rm api npx prisma migrate deploy
docker compose run --rm api npx ts-node prisma/seed.ts
```

## Ambiente local (sem Docker para api/web)

```bash
cd apps/api
npm install --workspaces=false
npx prisma generate
npx prisma db push
npx ts-node prisma/seed.ts
npm run start:dev            # :3001

cd ../web
npm install --workspaces=false
npm run build
npm start                    # :3000
```

## PM2 (produção simples)

Use o Dockerfile de cada app como referência; se preferir processos:

```bash
pm2 start apps/api/dist/src/main.js --name comercial-api
pm2 start apps/web/node_modules/next/dist/bin/next --name comercial-web -- start -p 3000
```

## Segurança

- Secrets apenas no `.env`/secret manager — nunca no repositório nem no frontend.
- O nginx deve forçar TLS (`infra/nginx/conf.d`) e limitar tam. de body para uploads. 
- `JWT_SECRET` e `N8N_WEBHOOK_SECRET` fortes; rotação programada.
- Backups do volume `postgres_data` (pg_dump via cron).

## Healthcheck

- `GET http://localhost:3001/api/health` — API viva e conectada ao banco.
- `GET http://localhost:3001/api/n8n/ping` — status da integração n8n.
- Frontend: `GET /login` deve responder 200.

## Troubleshooting rápido

| Sintoma | Verifique |
| --- | --- |
| API no ar mas web 500 | `NEXT_PUBLIC_API_URL` (build-time); corrija e re-build |
| Sync não roda | Redis/BullMQ ativos? `SYNC_*` config? |
| Mapa sem tiles | Internet no navegador (Leaflet CDN) |
| Erros TS no build da API | 15 erros pré-existentes em `dist` não bloqueiam o emit; falhas reais aparecem nos logs |
| Porta ocupada | `netstat -ano \| findstr :3001` e mate o PID do processo antigo |
| Conversas com "?" | Encoding do terminal; arquivos estão UTF-8 |