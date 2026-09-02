# Integrações — ODVIX, Mercos e Sync

## Princípios

1. **Nunca espalhar chamadas de sistemas externos pelo código.** Toda integração passa por um adapter dedicado em `apps/api/src/integrations/`.
2. **Fonte de verdade por entidade** (`/integrations/sources`): em cada ambiente de produção, defina por tabela quem é o dono dos dados.
   - Ex.: `customer → ODVIX`, `product → ODVIX`, `price → ODVIX`, `stock → ODVIX`, `order → ODVIX`, `CRM/Leads/Conversas → Plataforma`.
   - Com os sistemas de origem **desligados** (env `*_ENABLED=false`), a aplicação continua 100% utilizável com os dados locais — isso viabiliza o ambiente de demonstração.
3. **Nunca assumir que sistemas compartilham IDs.** A tabela `ExternalEntityMapping` (`system`, `entity`, `external_id`, `internal_id`) resolve identidade. Também há resolução por CNPJ/CPF/whatsapp/phone no sync.
4. **Idempotência**: o sync usa upserts; reprocessar um lote não duplica registros.

## ODVIX (ERP) — `ODVIXAdapter`

- Base em `apps/api/src/integrations/odvix/`.
- Auth por `Client-Id` / `Client-Token` (não é Basic Auth do usuário).
- **Endpoints configuráveis por env** (`ODVIX_PATH_CLIENTES`, `ODVIX_PATH_PRODUTOS`, `ODVIX_PATH_PEDIDOS`, `ODVIX_PATH_VENDEDORES`, `ODVIX_PATH_ESTOQUE`): a API ODVIX expõe controllers customizáveis por instalação — não fixamos paths.
- Entidades: `getCustomers/getCustomer/getByPhone`, `getProducts/getStocks`, `getPrices`, `getOrders/createOrder/cancelOrder`, `getSalesHistory`.
- Resiliência: `ODVIX_TIMEOUT_MS`, rate limit `ODVIX_RATE_LIMIT_PER_MIN`, retry com backoff, `ODVIX_ENABLED` para ativar/desativar; `ODVIX_EMPRESA_ID` para filtros da empresa.
- Empurrar pedido: `POST /integrations/sync/push-order/:orderId` ao ODVIX.

## Mercos (força de vendas) — `MercosAdapter`

- Base em `apps/api/src/integrations/mercos/`.
- Auth: company token (`MERCOS_COMPANY_TOKEN`) no header `Authorization`.
- Endpoints usados: `/v1/clientes`, `/v1/produtos`, `/v2/pedidos`, `/v1/tabelas_preco` etc. — ver `docs.mercos.com`.
- Normalização: a camada converte o formato Mercos para o domínio interno antes de persistir, impedindo acoplamento de detalhes da API do Mercos no core.
- Desligável com `MERCOS_ENABLED`.

## Motor de Sync

`POST /integrations/sync/run` processa, por entidade e na ordem:

```
clientes → produtos → tabelas de preço → estoque → pedidos
```

- **Scheduler** (`SYNC_INTERVAL_MS`) + execuções manuais.
- **Balanceamento de fonte**: se `price_source = ODVIX`, os preços do Mercos não sobrescrevem os do ODVIX.
- **Controle**: `GET /integrations/sync/status` (última execução, contadores), `POST retry`, `POST reclassify` (recalcula classificações dos clientes após sync).
- **Observação (Windows)**: o agendador roda via `Agenda`/BullMQ; em dev use o `npm run dev` (api+web) para que o worker BullMQ esteja ativo.

## Registro de fontes

`GET/POST /integrations/sources` permite ver/alterar a fonte por entidade sem código. Persistido no banco (tabela `Integration`), com valores default em seed.