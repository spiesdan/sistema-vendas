# Arquitetura

## Visão geral

A **Comercial Ops** é um *modular monolith*: um único processo NestJS expõe toda a API, organizado em módulos por domínio. O frontend é um Next.js 15 (App Router) separado, consumindo somente a API REST.

```
                    ┌───────────────┐
                    │    ODVIX      │  ERP (fonte de clientes/produtos/
                    └──────┬────────┘   estoque/pedidos no ambiente real)
                           │
                           ▼
                    ┌───────────────┐
                    │ MercosAdapter │  Força de vendas (fonte de vendas)
                    └──────┬────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │          CORE APPLICATION            │
        │                                      │
        │  auth · users · crm (customers,      │
        │  products, orders, regions) · leads  │
        │  campaigns · whatsapp · intelligence │
        │  copilot · automation · n8n ·        │
        │  integrations (odvix/mercos/sync)    │
        │  queue (BullMQ) · settings · alerts  │
        └──────────────┬───────────────────────┘
                       │  REST / events / webhooks
                       ▼
                 ┌───────────┐
                 │   N8N     │  Motor de automação (workflows,
                 └───────────┘  campanhas, follow-ups, IA)
```

## Regra arquitetural mais importante

O **n8n NÃO é proprietário das regras críticas do negócio**. A aplicação é a fonte de verdade para clientes, produtos, preços, estoque, pedidos, condições comerciais, usuários, permissões, CRM, leads, histórico, regras comerciais, integrações e auditoria.

O n8n é apenas o **motor de automação/orquestração**: dispara workflows, executa campanhas, follow-ups e processos assíncronos — sempre consumindo **APIs internas** da aplicação, nunca o PostgreSQL de domínio diretamente.

## Camadas de um módulo

Cada módulo segue o padrão NestJS:

```
módulo/
  *.controller.ts   → validação mínima + delegação
  *.service.ts      → regras de negócio
  *.repository.ts   → quando necessário
  *.schemas.ts      → validação (zod)
  *.types.ts        → tipos/constantes (normalmente em packages/shared)
  events/           → eventos publicados (quando aplicável)
```

Regra: **não colocar lógica de negócio nos controllers** e não duplicar regras entre módulos.

## Fluxo de dados principal

```
WHATSAPP → webhook → whatsapp service → chatbot IA
  → identifica cliente → carrinho → OrderService
  → evento order.created → fila BullMQ → n8n (pós-venda/recompra/cross-sell)
  → ODVIX → pedido processado
```

Representante humano entra somente quando a IA faz *handoff* (negociação, reclamação, VIP, alto valor, baixa confiança).

## Comunicação entre processos

- **REST** — API (Next.js → NestJS; n8n → NestJS).
- **Webhooks** — entrada: `/webhooks/whatsapp` e `/webhooks/n8n`; saída: eventos entregues ao n8n.
- **Redis/BullMQ** — filas de integração e processamento assíncrono (sync odvix/mercos, recomendações, publicação de eventos).
- **Eventos** — catálogo tipado compartilhado em `packages/shared` (ex.: `customer.inactive`, `customer.reorder_opportunity`, `order.created`, `cart.abandoned`).

## Multi-tenant

O domínio foi **estruturado para evoluir para SaaS**: chaves de fonte por entidade (`customer_source`, `product_source`, ...) e tabela `ExternalEntityMapping` para resolução de identidade entre sistemas. Nesta primeira versão os dados não são isolados por `tenantId` — um tenant único implícito. A evolução deve manter tabelas de mapeamento de fonte e mapeamento externo para nunca assumir que sistemas compartilham IDs.

## Decisões técnicas

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Arquitetura | Modular monolith | Evita microserviços prematuros; módulos já isolados para extração futura |
| ID dos clientes | UUID interno + `ExternalEntityMapping` | Sistemas externos não compartilham IDs |
| Fonte de verdade | Por entidade, configurável | Clientes→ODVIX, CRM→Plataforma, etc. |
| Automação | n8n | Engine pronto; a app só orquestra e audita execuções |
| Regras de negócio | Em código (explicáveis) | Previsibilidade e auditoria (churn/reorder por regras, não ML) |