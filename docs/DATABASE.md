# Banco de Dados — Schema Prisma

SGBD: **PostgreSQL 16** via **Prisma ORM** (`apps/api/prisma/schema.prisma`).

## Modelo de domínio

```
Tenant* / User / Role / Permission

Customer / CustomerExternalMapping
  ├── CustomerScore
  ├── Recommendation
  └── Order ── OrderItem
       └── LostSale

Lead / LeadActivity

Product / ProductExternalMapping / ProductPrice / Inventory
  ├── Category
  └── InventoryMovement

Conversation / Message

Campaign / CampaignExecution / CampaignAudience

Automation / AutomationExecution / AutomationEvent

Integration / IntegrationSync / IntegrationError

Region / City

Alert / AuditLog / Widget  (+ entidades de settings/estado)
```

> `*Tenant`: o schema já prevê o campo `tenantId` em modelos-chave para evolução SaaS (ver `docs/ARCHITECTURE.md`); na v1 os dados são de um único tenant.

## Campos centrais

### Customer

`name`, `tradeName`, `document`, `cnpj/cpf`, `email`, `phone`, `whatsapp`, `status` (`NOVO|ATIVO|OCASIONAL|EM_RISCO|INATIVO|PERDIDO`), `tier` (`VIP|...`), `cityId`, `totalSpent`, `orderCount`, `averageTicket`, `lastPurchaseAt`, `expectedNextPurchaseAt`, `averagePurchaseIntervalDays`, `score`, `churnRiskScore`, `reorderProbability`, `latitude/longitude`.

### Order

`number`, `customerId`, `items[]` (productId, quantity, unitPrice, discount, total), `subtotal`, `total`, `status` (`PENDENTE|FATURADO|CANCELADO|...`), `source` (`WHATSAPP_AI|WHATSAPP_HUMAN|WEB|REPRESENTATIVE|CAMPAIGN|RECOVERY|REORDER`), `campaignId`, `automationId`, `conversationId`, `representativeId`, `createdBy`.

### Product

`name`, `sku`, `categoryId`, `unit`, `packaging`, `active`, `minStock`; `ProductPrice` (value, effectiveFrom, active) e `Inventory` (quantity).

## Índices recomendados (já presentes via Prisma)

- `Customer.phone`, `Customer.email`, `Customer.whatsapp`, `Customer.externalId`
- `Order.customerId`, `Order.createdAt`
- `Message.conversationId`, `Message.createdAt`
- `AutomationExecution.status`, `AutomationExecution.createdAt`

## Fonte / mapeamento externo

- `ExternalEntityMapping` (`system`, `entity`, `external_id`, `internal_id`) — resolve identidade ODVIX/Mercos.
- `customer_source`, `product_source`, `price_source`, `stock_source`, `order_source` — quem é dono de cada entidade (via `/integrations/sources`).
- Desligar fontes (`*_ENABLED=false`) mantém o banco de demonstração utilizável.

## Migração

- Dev: `npx prisma db push` (esquema → banco).
- Prod: `npm run db:migrate` (`prisma migrate deploy`).

## Seed

- `apps/api/prisma/seed.ts` — admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), usuários por role, região/cidades, tipos, integrações default, configurações.
- `apps/api/prisma/seed-demo.ts` — demonstração rica: 3 regiões, 15 cidades georeferenciadas, 14 produtos, 20 clientes, 70+ pedidos, recomendações, lost sale. **Não idempotente para preços/pedidos** — rodar uma vez. Ideal para testar dashboard, mapa de clientes e inteligência sem ODVIX/Mercos.

## Ambientes atuais

Dev roda em Docker (`docker compose up -d postgres redis`). Banco: `comercial_ops`, usuário `comercial` (ver `docker-compose.yml`).