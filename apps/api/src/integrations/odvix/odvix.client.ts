import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpClient } from '../common/base-http.client';

export interface OdvixCustomer {
  id?: string | number;
  codigo?: string | number;
  nome?: string;
  razaoSocial?: string;
  fantasia?: string;
  cnpj?: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  celular?: string;
  cidade?: string;
  uf?: string;
  bairro?: string;
  endereco?: string;
  numero?: string;
  cep?: string;
  vendedorId?: string | number;
}

export interface OdvixProduct {
  codigo?: string;
  descricao?: string;
  nome?: string;
  unidade?: string;
  categoria?: string;
  ean?: string;
  precoVenda?: number;
  precoVenda2?: number;
  saldo?: number;
  ativo?: boolean;
}

export interface OdvixOrderItem {
  codigoProduto?: string;
  quantidade?: number;
  valorUnitario?: number;
  desconto?: number;
}

export interface OdvixOrder {
  numero?: string | number;
  clienteId?: string | number;
  data?: string;
  valorTotal?: number;
  condicaoPagamento?: string;
  itens?: OdvixOrderItem[];
  vendedorId?: string | number;
  situacao?: string | number;
}

export interface OdvixSalesperson {
  id?: string | number;
  codigo?: string | number;
  nome?: string;
  email?: string;
  telefone?: string;
  ativo?: boolean;
}

/**
 * ODVIX Adapter
 * -------------
 * Camada única de acesso à API ODVIX. A documentação pública da ODVIX
 * (Postman: documenter.getpostman.com/view/23935422/2sAYHzGiZ7) expõe
 * controllers configuráveis autenticados via headers `Client-Id` e
 * `Client-Token`, com EmpresaId opcional no corpo/consulta.
 *
 * IMPORTANTE — Não assumimos a existência de endpoints. Os caminhos são
 * configurados via ambiente (ODVIX_PATH_CUSTOMERS etc.) e os mapeamentos
 * de campos são tolerantes a variações de nomenclatura. Antes de ativar em
 * produção, alinhe os paths com a instalação ODVIX do cliente.
 */
@Injectable()
export class OdvixClient extends BaseHttpClient {
  private readonly empresaId?: string;
  private readonly paths: Record<string, string> = {};

  constructor(config: ConfigService) {
    super(
      'Odvix',
      {
        baseUrl: config.get<string>('ODVIX_BASE_URL', ''),
        timeoutMs: config.get<number>('ODVIX_TIMEOUT_MS', 30000),
        maxRetries: config.get<number>('ODVIX_MAX_RETRIES', 3),
        rateLimitPerMin: config.get<number>('ODVIX_RATE_LIMIT_PER_MIN', 60),
        headers: {},
      },
    );
    this.empresaId = config.get<string>('ODVIX_EMPRESA_ID');
    this.paths = {
      CUSTOMERS: config.get<string>('ODVIX_PATH_CUSTOMERS', ''),
      PRODUCTS: config.get<string>('ODVIX_PATH_PRODUCTS', ''),
      ORDERS: config.get<string>('ODVIX_PATH_ORDERS', ''),
      SALESPEOPLE: config.get<string>('ODVIX_PATH_SALESPEOPLE', ''),
      STOCK: config.get<string>('ODVIX_PATH_STOCK', ''),
    };
  }

  get enabled() {
    return Boolean(this.paths.CUSTOMERS || this.paths.PRODUCTS || this.paths.ORDERS);
  }

  protected authHeaders(): Record<string, string> {
    return {
      'Client-Id': this.options.headers['Client-Id'] ?? '',
      'Client-Token': this.options.headers['Client-Token'] ?? '',
    };
  }

  /** Mudança de credenciais em runtime (vinda da tela de integração). */
  setCredentials(clientId: string, clientToken: string) {
    this.options.headers['Client-Id'] = clientId;
    this.options.headers['Client-Token'] = clientToken;
  }

  private async requestFor<T>(
    kind: keyof typeof this.paths,
    method: 'GET' | 'POST' | 'PUT',
    body?: unknown,
    query?: Record<string, unknown>,
  ) {
    const path = this.paths[kind];
    if (!path) {
      return {
        ok: false as const,
        status: 0,
        error: `Endpoint ODVIX '${kind}' não configurado. Defina ODVIX_PATH_${kind}.`,
        data: undefined as T | undefined,
        retries: 0,
        durationMs: 0,
      };
    }
    return this.request<T>(method, path, body, query);
  }

  private syncQuery(syncFrom?: string) {
    const q: Record<string, unknown> = {};
    if (syncFrom) q['alteradoDesde'] = syncFrom;
    if (this.empresaId) q['EmpresaId'] = this.empresaId;
    return q;
  }

  private toArray(data: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      for (const key of ['data', 'records', 'result', 'resultado', 'value', 'itens']) {
        if (Array.isArray(obj[key])) return obj[key] as Array<Record<string, unknown>>;
      }
    }
    return [];
  }

  private mapCustomer(raw: Record<string, unknown>): OdvixCustomer {
    return {
      id: (raw.id ?? raw.clienteId ?? raw.codigo ?? raw.CLIENTEID) as never,
      codigo: (raw.codigo ?? raw.CODIGO ?? raw.cliente) as never,
      nome: (raw.nome ?? raw.razaoSocial ?? raw.RAZAOSOCIAL ?? raw.fantasia) as string,
      razaoSocial: (raw.razaoSocial ?? raw.RAZAOSOCIAL) as string,
      fantasia: (raw.fantasia ?? raw.NOMEFANTASIA) as string,
      cnpj: (raw.cnpj ?? raw.CNPJ) as string,
      cpf: (raw.cpf ?? raw.CPF) as string,
      email: (raw.email ?? raw.EMAIL) as string,
      telefone: (raw.telefone ?? raw.TELEFONE) as string,
      celular: (raw.celular ?? raw.CELULAR) as string,
      cidade: (raw.cidade ?? raw.CIDADE) as string,
      uf: (raw.uf ?? raw.UF) as string,
      bairro: (raw.bairro ?? raw.BAIRRO) as string,
      endereco: (raw.endereco ?? raw.ENDERECO) as string,
      numero: (raw.numero ?? raw.NUMERO) as string,
      cep: (raw.cep ?? raw.CEP) as string,
      vendedorId: (raw.vendedorId ?? raw.VENDEDORID) as never,
    };
  }

  private mapProduct(raw: Record<string, unknown>): OdvixProduct {
    return {
      codigo: (raw.codigo ?? raw.CODIGO ?? raw.produto) as string,
      descricao: (raw.descricao ?? raw.DESCRICAO ?? raw.nome) as string,
      nome: (raw.nome ?? raw.NOME ?? raw.DESCRICAO) as string,
      unidade: (raw.unidade ?? raw.UNIDADE) as string,
      categoria: (raw.categoria ?? raw.CATEGORIA) as string,
      ean: (raw.ean ?? raw.EAN ?? raw.barra) as string,
      precoVenda: Number(raw.precoVenda ?? raw.PRECOVENDA ?? 0),
      precoVenda2: Number(raw.precoVenda2 ?? raw.PRECOVENDA2 ?? 0),
      saldo: Number(raw.saldo ?? raw.SALDO ?? raw.Estoque ?? 0),
      ativo: (raw.ativo ?? raw.ATIVO ?? true) !== false,
    };
  }

  private mapOrder(raw: Record<string, unknown>): OdvixOrder {
    return {
      numero: (raw.numero ?? raw.NUMERO ?? raw.pedido) as never,
      clienteId: (raw.clienteId ?? raw.CLIENTEID ?? raw.cliente) as never,
      data: (raw.data ?? raw.DATA ?? raw.dataEmissao) as string,
      valorTotal: Number(raw.valorTotal ?? raw.VALORTOTAL ?? 0),
      condicaoPagamento: (raw.condicaoPagamento ?? raw.CONDICAOPAGAMENTO) as string,
      vendedorId: (raw.vendedorId ?? raw.VENDEDORID) as never,
      situacao: (raw.situacao ?? raw.SITUACAO ?? raw.status) as never,
      itens: Array.isArray(raw.itens)
        ? (raw.itens as Array<Record<string, unknown>>).map((it) => ({
            codigoProduto: (it.codigoProduto ?? it.CODIGOPRODUTO ?? it.produto) as string,
            quantidade: Number(it.quantidade ?? it.QUANTIDADE ?? it.qtd ?? 0),
            valorUnitario: Number(it.valorUnitario ?? it.VALORUNITARIO ?? 0),
            desconto: Number(it.desconto ?? it.DESCONTO ?? 0),
          }))
        : [],
    };
  }

  async getCustomers(syncFrom?: string) {
    const res = await this.requestFor<unknown>('CUSTOMERS', 'GET', undefined, this.syncQuery(syncFrom));
    return { ok: res.ok, error: res.error, data: this.toArray(res.data).map((r) => this.mapCustomer(r)) };
  }

  async getProducts(syncFrom?: string) {
    const res = await this.requestFor<unknown>('PRODUCTS', 'GET', undefined, this.syncQuery(syncFrom));
    return { ok: res.ok, error: res.error, data: this.toArray(res.data).map((r) => this.mapProduct(r)) };
  }

  async getOrders(syncFrom?: string) {
    const res = await this.requestFor<unknown>('ORDERS', 'GET', undefined, this.syncQuery(syncFrom));
    return { ok: res.ok, error: res.error, data: this.toArray(res.data).map((r) => this.mapOrder(r)) };
  }

  async getSalespeople() {
    const res = await this.requestFor<unknown>('SALESPEOPLE', 'GET');
    const data = this.toArray(res.data).map((raw) => ({
      id: (raw.id ?? raw.ID) as never,
      codigo: (raw.codigo ?? raw.CODIGO ?? raw.vendedor) as string,
      nome: (raw.nome ?? raw.NOME ?? raw.nome_vendedor) as string,
      email: (raw.email ?? raw.EMAIL) as string,
      telefone: (raw.telefone ?? raw.TELEFONE) as string,
      ativo: (raw.ativo ?? raw.ATIVO ?? true) !== false,
    }));
    return { ok: res.ok, error: res.error, data };
  }

  async getStock() {
    const res = await this.requestFor<unknown>('STOCK', 'GET', undefined, this.syncQuery());
    const data = this.toArray(res.data).map((raw) => ({
      codigo: (raw.codigo ?? raw.CODIGO ?? raw.produto) as string,
      saldo: Number(raw.saldo ?? raw.SALDO ?? raw.quantidade ?? 0),
    }));
    return { ok: res.ok, error: res.error, data };
  }

  /** Envia pedido ao ERP. Retorna o número/ID do pedido no ODVIX. */
  async pushOrder(order: OdvixOrder) {
    const body: Record<string, unknown> = {
      ...(order as unknown as Record<string, unknown>),
      ...(this.empresaId ? { EmpresaId: this.empresaId } : {}),
    };
    const res = await this.requestFor<Record<string, unknown>>('ORDERS', 'POST', body);
    const returnedId =
      res.data?.numero ?? res.data?.id ?? res.data?.pedido ?? res.data?.ID ?? order.numero;
    return { ok: res.ok, error: res.error, externalId: String(returnedId ?? '') };
  }
}