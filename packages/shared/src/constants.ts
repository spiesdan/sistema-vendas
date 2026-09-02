// =========================================================================
//  Constantes de negócio compartilhadas
// =========================================================================

export const APP_NAME = 'Comercial Ops';

export const ORDER_SOURCES = [
  'WHATSAPP_AI',
  'WHATSAPP_HUMAN',
  'WEB',
  'CAMPAIGN',
  'REPRESENTATIVE',
  'MANUAL',
] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_STATUSES = [
  'ORCAMENTO',
  'PENDENTE',
  'CONFIRMADO',
  'ENVIADO_ERP',
  'FATURADO',
  'PARCIAL',
  'CANCELADO',
  'PROBLEMA',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CUSTOMER_STATUSES = [
  'NOVO',
  'ATIVO',
  'EM_RISCO',
  'INATIVO',
  'PERDIDO',
  'VIP',
  'OCASIONAL',
  'LEAD',
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const LEAD_STATUSES = [
  'NOVO',
  'CONTATO',
  'INTERESSADO',
  'NEGOCIACAO',
  'PRIMEIRO_PEDIDO',
  'CLIENTE_ATIVO',
  'PERDIDO',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ROLE_NAMES = [
  'ADMIN',
  'GESTOR',
  'COMERCIAL',
  'REPRESENTANTE',
  'ATENDENTE',
  'MARKETING',
  'FINANCEIRO',
  'SUPORTE',
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const INTEGRATION_PROVIDERS = ['ODVIX', 'MERCOS', 'WHATSAPP', 'OTHER'] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const SYNC_ENTITIES = ['CLIENTE', 'PRODUTO', 'PEDIDO', 'VENDEDOR', 'ESTOQUE', 'PRECO'] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const LOST_SALE_REASONS = [
  'PRECO',
  'PRAZO',
  'ESTOQUE',
  'CONCORRENCIA',
  'SEM_RESPOSTA',
  'DESISTENCIA',
  'CONDICAO_PAGAMENTO',
  'OUTRO',
] as const;
export type LostSaleReason = (typeof LOST_SALE_REASONS)[number];

export const ALERT_TYPES = [
  'CLIENTE_INATIVO',
  'CLIENTE_EM_RISCO',
  'QUEDA_CONSUMO',
  'PEDIDO_ABANDONADO',
  'LEAD_SEM_ATENDIMENTO',
  'OPORTUNIDADE_SEM_CONTATO',
  'PRODUTO_SEM_ESTOQUE',
  'VIP_SEM_COMPRA',
  'RECLAMACAO',
  'PEDIDO_PARADO',
  'INTEGRACAO_FALHOU',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];