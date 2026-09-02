# n8n — Motor de Automação

## Papel

O n8n é um componente oficial da arquitetura, responsável por **workflows, campanhas, notificações, follow-ups e processamento de eventos**. A aplicação continua sendo a fonte de verdade; o n8n **nunca acessa o PostgreSQL principal diretamente** — consome as APIs internas (`/api/...`) via `Authorization: Bearer`.

## Configuração

Variáveis (ver `docs/ENVIRONMENT.md`):

- `N8N_BASE_URL` — base do n8n (ex.: `http://localhost:5678`).
- `N8N_API_KEY` — chave da API do n8n (owner).
- `N8N_WEBHOOK_SECRET` — secret usado na chamada de entrada `POST /webhooks/n8n` e para autenticar webhooks de resposta.

Secrets **nunca** no frontend. O `N8nClient` fica no backend:

```ts
triggerWorkflow(workflowId, data)   // POST /n8n/workflow/:id/trigger
getExecution(id)                    // GET  /n8n/executions/:id
retryExecution(id)                  // POST /n8n/executions/:id/retry
```

## Fluxo de aplicação → n8n

```
Order.created → AutomationService → fila publish_event → N8N (webhook)
                                                          ↓
                                          GET /api/customers/:id, /api/products,
                                          GET /api/automation/customers... (sempre via API),
                                                          ↓
                                          WHATSAPP_AI → conversa → pedido
```

## Fluxo de n8n → aplicação

O n8n chama a API REST da aplicação (ex.: `POST /api/orders` para criar pedido com `created_by`, `campaign_id`, `automation_id`, `conversation_id`), nunca `INSERT` direto.

## Webhook de entrada

- **`POST /webhooks/n8n`**: o n8n envia eventos de progresso/resultado. Requer header `X-Webhook-Secret` == `N8N_WEBHOOK_SECRET`. Protegido contra replay/timestamp. Correlaciona com `AutomationExecution.n8nExecutionId`.
- **`POST /webhooks/whatsapp`**: provedor WhatsApp (em produção use Evolution API/WhatsApp Business Cloud — o handler é o mesmo `chatbot` módulo WhatsApp com IA pt-BR).

## Workflows iniciais (modelo de negócio, para criação no n8n)

1. **Cliente inativo** — Schedule → `/automation/customers/inactive` (via API) → histórico → produtos → estoque → IA → WhatsApp → aguardar resposta → follow-up/encerrar.
2. **Novo lead** — Lead criado → qualificar → cidade → segmento → potencial → WhatsApp → catálogo → necessidade → recomendação → oportunidade → pedido.
3. **Carrinho abandonado** — `cart.abandoned` → esperar → WhatsApp "Você ainda precisa dos produtos?" → IA recupera → pedido.
4. **Recompra** — `customer.reorder_opportunity` → habituais → quantidade → estoque → WhatsApp → carrinho → pedido.
5. **Cliente novo** — `order.created` → espera → satisfação → nova necessidade → cross-sell.
6. **Pós-venda** — pedido entregue → "Deu tudo certo?" → positivo relacionamento / negativo humano.
7. **Recuperação de venda perdida** — LostSale → IA aborda → recupera (`recovered_at`).

## Endpoints do módulo

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/n8n/status` | Conectividade/registro |
| POST | `/n8n/workflow/:id/trigger` | Dispara workflow |
| GET | `/n8n/executions/:id` | Estado da execução |
| POST | `/n8n/executions/:id/retry` | Retenta |
| POST | `/n8n/retry-failed` | Dead-letter (reprocessa falhas) |
| POST | `/n8n/events` | Evento genérico (idempotente) |
| GET | `/n8n/ping` | Healthcheck |

## Regras

- **Nunca implementar regra crítica exclusivamente em workflow.**
- **Idempotência**: usar `eventId`/`idempotencyKey`/`externalId` para eventos críticos (`order.created` recebido 2× ≠ 2 pedidos).
- **Observabilidade**: cada execução gera `AutomationExecution` rastreável.
- **Disponibilidade**: sem n8n, o sistema básico segue operando; eventos ficam em fila.