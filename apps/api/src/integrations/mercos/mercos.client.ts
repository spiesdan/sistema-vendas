import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpClient } from '../common/base-http.client';

export interface MercosCustomer {
  id: number;
  razao_social?: string;
  nome_fantasia?: string;
  tipo?: string;
  cnpj?: string;
  inscricao_estadual?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  cep?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  emails?: Array<{ email: string }>;
  telefones?: Array<{ numero: string }>;
  limite_credito?: Array<{ limite_disponivel: number; limite_total: number }>;
  ultima_alteracao?: string;
}

export interface MercosProduct {
  id: number;
  codigo?: string;
  nome?: string;
  descricao?: string;
  unidade?: string;
  preco_tabela?: number;
  saldo_estoque?: number;
  categoria?: { id: number; nome: string };
  ativo?: boolean;
}

export interface MercosOrderItem {
  produto_id: number;
  preco_tabela: number;
  preco_liquido?: number;
  quantidade: number;
  desconto?: number;
}

export interface MercosOrder {
  id?: number;
  numero?: number;
  cliente_id: number;
  condicao_pagamento?: string;
  condicao_pagamento_id?: number;
  data_emissao?: string;
  vendedor_id?: number;
  itens: MercosOrderItem[];
  valor_total?: number;
}

/**
 * MERCOS Adapter
 * --------------
 * Baseado na documentação oficial: https://docs.mercos.com/
 * Autenticação via header `Authorization` com Company Token.
 * Endpoints reais: /v1/produtos, /v1/clientes, /v1/usuarios,
 * /v2/pedidos, /v1/tabelas_preco, /v1/condicoes_pagamento,
 * /v1/ajustar_estoque_em_lote, /v1/pedidos/cancelar/{id}, webhooks.
 */
@Injectable()
export class MercosClient extends BaseHttpClient {
  private companyToken: string;

  constructor(config: ConfigService) {
    super(
      'Mercos',
      {
        baseUrl: config.get<string>('MERCOS_BASE_URL', 'https://app.mercos.com/api'),
        timeoutMs: config.get<number>('MERCOS_TIMEOUT_MS', 30000),
        maxRetries: config.get<number>('MERCOS_MAX_RETRIES', 3),
        rateLimitPerMin: config.get<number>('MERCOS_RATE_LIMIT_PER_MIN', 120),
        headers: {},
      },
    );
    this.companyToken = config.get<string>('MERCOS_COMPANY_TOKEN', '');
  }

  get enabled() {
    return Boolean(this.companyToken);
  }

  protected authHeaders(): Record<string, string> {
    return {
      Authorization: this.companyToken,
    };
  }

  setToken(token: string) {
    this.companyToken = token;
  }

  // ---- Clientes -----------------------------------------------------
  async listCustomers(alteradoApos?: string) {
    return this.getPaginated('v1/clientes', {
      ...(alteradoApos ? { alterado_apos: alteradoApos } : {}),
    });
  }

  async getCustomer(id: number) {
    const res = await this.request<MercosCustomer>('GET', `v1/clientes/${id}`);
    return { ok: res.ok, error: res.error, data: res.data };
  }

  async createCustomer(data: Record<string, unknown>) {
    const res = await this.request<{ id: number }>('POST', 'v1/clientes', data);
    return { ok: res.ok, error: res.error, id: res.data?.id };
  }

  async updateCustomer(id: number, data: Record<string, unknown>) {
    const res = await this.request<{ id: number }>('PUT', `v1/clientes/${id}`, data);
    return { ok: res.ok, error: res.error, id: res.data?.id };
  }

  // ---- Produtos ------------------------------------------------------
  async listProducts(alteradoApos?: string) {
    return this.getPaginated('v1/produtos', {
      ...(alteradoApos ? { alterado_apos: alteradoApos } : {}),
    });
  }

  async getProduct(id: number) {
    const res = await this.request<MercosProduct>('GET', `v1/produtos/${id}`);
    return { ok: res.ok, error: res.error, data: res.data };
  }

  // ---- Tabelas de preço / categorias / condições ---------------------
  async listPriceTables() {
    return this.getPaginated('v1/tabelas_preco', { registros_por_pagina: 200 });
  }

  async listCategories() {
    return this.getPaginated('v1/categorias', { registros_por_pagina: 200 });
  }

  async listPaymentTerms() {
    return this.getPaginated('v1/condicoes_pagamento', { registros_por_pagina: 200 });
  }

  async listSalespeople() {
    return this.getPaginated('v1/usuarios', { registros_por_pagina: 200 });
  }

  // ---- Vendedores x Clientes -----------------------------------------
  async bindSalesperson(customerId: number, salespersonId: number, active: boolean) {
    const res = await this.request<unknown>('POST', 'v1/usuarios_clientes', {
      usuario_id: salespersonId,
      cliente_id: customerId,
      ativo: active,
    });
    return { ok: res.ok, error: res.error };
  }

  // ---- Pedidos --------------------------------------------------------
  async listOrders(alteradoApos?: string, status?: string) {
    return this.getPaginated('v2/pedidos', {
      ...(alteradoApos ? { alterado_apos: alteradoApos } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(status === undefined ? { status: '2' } : {}),
    });
  }

  async getOrder(id: number) {
    const res = await this.request('GET', `v2/pedidos/${id}`);
    return { ok: res.ok, error: res.error, data: res.data };
  }

  /** Cria pedido no Mercos (POST /v2/pedidos). */
  async createOrder(data: Partial<MercosOrder>) {
    const res = await this.request<{ id: number; numero?: number }>('POST', 'v2/pedidos', data);
    return { ok: res.ok, error: res.error, id: res.data?.id, numero: res.data?.numero };
  }

  async cancelOrder(id: number) {
    const res = await this.request<unknown>('POST', `v1/pedidos/cancelar/${id}`);
    return { ok: res.ok, error: res.error };
  }

  // ---- Estoque ----------------------------------------------------------
  async adjustStock(items: Array<{ produto_id: number; quantidade: number }>) {
    const res = await this.request<unknown>('POST', 'v1/ajustar_estoque_em_lote', { itens: items });
    return { ok: res.ok, error: res.error };
  }

  private async getPaginated(path: string, query: Record<string, unknown>) {
    const page = query.pagina ?? 1;
    const registrosPorPagina = query.registros_por_pagina ?? 100;
    const res = await this.request<{ registros?: unknown[] } | unknown[]>(
      'GET',
      path,
      undefined,
      { pagina: page, registros_por_pagina: registrosPorPagina, ...query },
    );
    if (!res.ok) return { ok: false, error: res.error, data: [] };
    const data = Array.isArray(res.data)
      ? res.data
      : ((res.data as { registros?: unknown[] })?.registros ?? []);
    return { ok: true, error: undefined, data };
  }
}