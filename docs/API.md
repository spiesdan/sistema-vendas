# API — Referência

Base URL (local):

- Backend: `http://localhost:3001` (prefixo global `/api`, ver `NEXT_PUBLIC_API_URL` no frontend).
- Healthcheck: `GET /health`.

Autenticação:

- `POST /auth/login` `{ email, password }` → `{ accessToken }`.
- `POST /auth/register` — **apenas roles ADMIN** (seeding de usuários operacionais).
- `GET /auth/me` — perfil do usuário atual.
- Enviar `Authorization: Bearer <token>` nas demais rotas. RBAC por `@Roles(...)` no controller (`ADMIN`, `GESTOR`, `COMERCIAL`, `REPRESENTANTE`, `ATENDENTE`, `MARKETING`, `FINANCEIRO`, `SUPORTE`). A rota `/register` persiste apenas `ADMIN`.

## Autenticação e usuários

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/auth/login` | Login JWT |
| POST | `/auth/register` | Criar usuário (somente ADMIN) |
| GET | `/auth/me` | Usuário atual |
| GET/PATCH | `/users/:id` | Usuário / edição (listagem e criação em `/users`) |

## CRM

### Clientes — `/customers`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/customers` | Lista (filtros: `search`, `status`, `tier`, `cityId`, `regionId`, `minScore`, `lastPurchaseDays`, `hasCoordinates`, `perPage`, `page`) |
| GET | `/customers/lookup/whatsapp/:number` | Resolve cliente por WhatsApp |
| GET | `/customers/map` | Clientes com coordenadas para o mapa (20 demonstração) |
| GET | `/customers/:id` | Detalhe; `?analyze=true` retorna inteligência (`metrics`, `topProducts`, `orders`, `events`, `conversations`, `recommendations`) |
| PATCH | `/customers/:id` | Atualiza cadastro |
| POST | `/customers/:id/recompute` | Recalcula score/classificação |

### Produtos — `/products`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/products` | Lista com preço e estoque |
| GET | `/products/low-stock` | Produtos abaixo do mínimo |
| GET | `/products/:id` | Detalhe (preços, estoque, categoria) |
| PATCH | `/products/:id` | Atualiza produto |
| POST | `/products/:id/price` | Novo preço (`value`, `effectiveFrom`) |
| POST | `/products/:id/stock` | Ajusta estoque (`quantity`) |

### Pedidos — `/orders`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/orders` | Lista com filtros e paginação; `summary` para KPIs |
| GET | `/orders/summary` | Totais |
| GET | `/orders/:id` | Detalhe com itens |
| PATCH | `/orders/:id/status` | Muda status |
| POST | `/orders/lost-sales` | Marca venda perdida |

### Regiões — `/regions`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/regions` / `/regions/map` | Regiões; `/map` retorna resumo geográfico |
| GET | `/regions/cities` | Cidades (filtro por região) |
| POST | `/regions/city` / `/regions/region` | Cria cidade/região |

## WhatsApp — `/whatsapp`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/whatsapp` | Lista conversas |
| GET | `/whatsapp/conversations` / `/:id` | Conversas / detalhe com mensagens |
| POST | `/whatsapp/conversations/:id/messages` | Envia mensagem no canal |
| POST | `/whatsapp/conversations/:id/assign` | Atribui humano |
| POST | `/whatsapp/conversations/:id/handoff` | Handoff para humano (gera resumo) |
| GET | `/whatsapp/conversations/:id/handoff-context` | Resumo para o representante |
| PATCH | `.../close` / `.../reopen` | Encerrar/reabrir |
| POST | `/whatsapp/conversations/:id/suggest` | Sugestão de resposta |

## Copiloto comercial — `/copilot`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/copilot/overview` | Mensagem + contadores (risco, recompra, lost sales recuperáveis, leads, oportunidade) |
| GET | `/copilot/forecast` | Previsão de receita |
| GET | `/copilot/best-time` | Melhor horário |
| GET | `/copilot/optimization` | Recomendações de otimização |

## Inteligência — `/intelligence`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/intelligence/actions?limit=` | Próximas ações priorizadas (Risco→Recompra→Recuperação) |
| GET | `/intelligence/abandoned` | **"Vendas deixando na mesa"**: cliente que desacelerou (`formerMonthly`/`currentMonthly`, `dropPct`, `stoppedProducts` — produtos que sumiram do mix) |
| GET | `/intelligence/recommendations` | Recomendações por cliente |
| POST | `/intelligence/cross-sell` | Quem compra X e não compra Y (correlação) |
| GET/POST | `/intelligence/lost-sales` | Vendas perdidas; `PATCH .../:id/recover` marca recuperação |
| GET | `/intelligence/opportunities` | Oportunidades; `POST` cria; `PATCH /:id` atualiza |
| POST | `/intelligence/recompute` | Recalcula classificação/score globalmente |

## Dashboard — `/dashboard`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/dashboard/overview` | KPIs (vendas hoje/mês, pedidos digitais, ativos, leads, últimos pedidos) |
| GET | `/dashboard/representative/daily` | "O que fazer hoje" para o representante |

## Automação — `/automation` e n8n — `/n8n`

Ver `docs/AUTOMATIONS.md` e `docs/N8N.md`.

## Campanhas — `/campaigns`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/campaigns` | Lista; `preview` calcula audiência; `:id/stats` mostra execução |
| PATCH | `/:id` · `/:id/status` | Edita / ativa-desativa |
| POST | `/:id/prepare` · `/:id/send` | Prepara segmentação e dispara |

## Leads — `/leads`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/leads/funnel` | Pipeline agregado |
| GET | `/leads/:id` · PATCH | Detalhe / edição |
| POST | `/:id/move` | Move etapa (`LEAD→CONTATO→INTERESSADO→QUALIFICADO→NEGOCIAÇÃO→PRIMEIRO_PEDIDO→CLIENTE`) |
| PATCH | `/:id/salesperson`, `/:id/qualify` | Atribui vendedor; qualifica |
| POST | `/:id/convert` | Converte em cliente |

## Integrações — `/integrations` e `/integrations/sync`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET/POST | `/integrations/sources` | Fontes por entidade (customer/product/price/stock/order_source) |
| GET | `/integrations/status` | Status ODVIX/Mercos |
| POST | `/integrations/sync/run` | Sincronização manual |
| POST | `/integrations/sync/retry` | Retenta erros |
| GET | `/integrations/sync/status` | Estado do sync |
| POST | `/integrations/sync/reclassify` | Reclassifica clientes |
| POST | `/integrations/sync/push-order/:orderId` | Envia pedido ao ODVIX |

## Catálogo público — `/public/catalog`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/public/catalog` | Catálogo aberto (QR/links) |
| GET | `/public/catalog/:id` | Produto do catálogo |

## Alertas — `/alerts`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/alerts` | Alertas para o sino (risco, estoque baixo, lost sales, falha de automação) |

## Settings — `/settings`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/settings` | Configurações dinâmicas (impressa/digital, empresa, inteligência) |
| PATCH | `/settings` | Atualiza (`general`, `commercial`, `intelligence`, etc.) |

## Webhooks (entrada) — sem autenticação JWT, com assinatura

| Método | Rota | Origem |
| --- | --- | --- |
| POST | `/webhooks/whatsapp` | Provedor WhatsApp (valida timestamp/idempotência) |
| POST | `/webhooks/n8n` | n8n (valida `X-Webhook-Secret`) |

## Convenções

- Erros: `{ statusCode, message, error }` (padrão NestJS).
- Paginação em listas: `{ data, meta: { page, perPage, total, totalPages } }`.
- Valores monetários: números decimais; a API usa `Prisma.Decimal` (serializado como string sempre que preciso) — converter com `Number()` no frontend (`formatCurrency`).
- Datas: ISO 8601 (`new Date().toISOString()`).