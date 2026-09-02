# Automações e Agenda de Ações

## Motors presentes

| Motor | Papel | Quando roda |
| --- | --- | --- |
| **BullMQ (Redis)** | Filas assíncronas: sync, recomendações, publicação de eventos, envio de WhatsApp, processamento de campanha | Enfileirado por eventos da API; retry/backoff; dead-letter registrado em `AutomationExecution` |
| **Agenda** | Jobs periódicos (reclassificação, follow-ups, scheduler de sync) | Intervalo configurável |
| **n8n** | Workflows de campanha/follow-up (ver `docs/N8N.md`) | Disparado via webhook/API pela aplicação |

## Regra central

O **n8n é o motor de execução, não o dono das regras**. Tudo que é crítico (classificação, risco, recompra, pedido, preço, estoque) está no código da aplicação. Se o n8n cair, o sistema continua: clientes, CRM, produtos, pedidos e dados continuam funcionando; os eventos ficam em fila para processamento posterior.

## Eventos principais

Catálogo em `packages/shared` com formato:

```json
{
  "eventId": "uuid",
  "eventType": "customer.at_risk",
  "occurredAt": "ISO",
  "entityId": "uuid",
  "tenantId": null,
  "data": {},
  "correlationId": "uuid"
}
```

Exemplos: `customer.created|updated|inactive|at_risk|reorder_opportunity`, `lead.created|qualified|converted`, `conversation.created`, `customer.replied`, `customer.requested_human`, `cart.created|abandoned`, `order.created|confirmed|cancelled|failed`, `product.low_stock`, `campaign.sent`, `payment.overdue`.

## API de automação

### `Automation` (builder interno) — `/automation`

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/automation` | Lista automações (nome, status, última execução, execuções, sucessos, falhas) |
| GET | `/automation/:id` | Detalhe |
| PATCH | `/automation/:id` | Edita |
| DELETE | `/automation/:id` | Remove |
| PATCH | `/automation/:id/enabled` | Ativa/desativa |
| POST | `/automation/:id/run` | Executa agora (replay) |
| GET | `/automation/:id/candidates` | Clientes elegíveis para a automação |

### `AutomationService` (disparo interno)

- Publica eventos com **idempotência** (eventId/idenpotency key).
- Registra `AutomationExecution`: `status` (PENDING/RUNNING/SUCCESS/FAILED/CANCELLED/RETRYING), `startedAt/finishedAt`, `error`, `n8nExecutionId`, `correlationId`.
- Permite retry/replay e visualização de falhas.

### `AutomationExecution` — estados

`PENDING → RUNNING → SUCCESS | FAILED → RETRYING → ... | DEAD_LETTER (reprocessável via `n8n/retry-failed`)`.

## Filas (BullMQ)

Filas registradas (ver `apps/api/src/queue/`):

- `sync_odvix`, `sync_mercos` — integrações
- `process_customer` — reclassificação/score
- `calculate_recommendations` — recomendações
- `publish_event` — eventos da fila (eventual entrega ao n8n)
- `send_whatsapp` — envio de mensagens
- `process_campaign` — campanhas
- `cart` — expiração de carrinho (TTL → `cart.abandoned`/lost sale)

Configuráveis: retry, backoff, prioridade, dead letter. A ausência de Redis é tolerada em dev (a fila degrada para execução síncrona conforme config) — em produção o Redis é obrigatório.

## Webhooks (seguros)

`POST /webhooks/n8n` — mesmo provendo secret (`N8N_WEBHOOK_SECRET`), valida assinatura em `X-Webhook-Secret` e rejeita chamadas anônimas. `POST /webhooks/whatsapp` valida proveniência e previne replay por `x-timestamp`.

## Carrinho com TTL

`CART_TTL_MINUTES` (padrão 30). Ao expirar: dispara `cart.abandoned` → automação "Recuperar carrinho" via n8n/IA.