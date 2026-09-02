import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OdvixClient } from '../odvix/odvix.client';
import { MercosClient } from '../mercos/mercos.client';
import { IntegrationRegistryService, DEFAULT_SOURCE_CONFIG } from '../integration-registry.service';
import { CustomerIntelligenceService } from '../../crm/services/customer-intelligence.service';
import type { Customer, IntegrationProvider, Product, SyncJobStatus } from '@prisma/client';

interface SyncOptions {
  full?: boolean;
  provider?: IntegrationProvider;
}

interface NormalizedProduct {
  code: string;
  name: string;
  category?: string;
  unit?: string;
  price?: number;
  stock?: number;
  barcode?: string;
  externalMapping: { odvix?: string; mercos?: string };
  source: string;
}

interface NormalizedCustomer {
  name: string;
  legalName?: string;
  document?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  city?: string;
  state?: string;
  address?: string;
  number?: string;
  neighborhood?: string;
  zip?: string;
  externalMapping: { odvix?: string; mercos?: string };
  source: string;
}

/**
 * Motor de sincronização ODVIX/Mercos → Plataforma.
 * Suporta sync completo, incremental, retry, idempotência e logs.
 */
@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private syncRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly odvix: OdvixClient,
    private readonly mercos: MercosClient,
    private readonly registry: IntegrationRegistryService,
    private readonly intelligence: CustomerIntelligenceService,
  ) {}

  async onModuleInit() {
    // Registra as integrações no banco se ainda não existirem
    if (this.odvix.enabled) await this.ensureIntegration('ODVIX');
    if (this.mercos.enabled) await this.ensureIntegration('MERCOS');
  }

  async ensureIntegration(provider: IntegrationProvider) {
    const existing = await this.prisma.integration.findUnique({
      where: { provider_name: { provider, name: provider } },
    });
    if (existing) return existing;
    return this.prisma.integration.create({
      data: {
        provider,
        name: provider,
        enabled: provider === 'ODVIX' ? this.odvix.enabled : this.mercos.enabled,
        status: provider === 'ODVIX' ? (this.odvix.enabled ? 'CONNECTED' : 'DISCONNECTED') : this.mercos.enabled ? 'CONNECTED' : 'DISCONNECTED',
      },
    });
  }

  private async getIntegration(provider: IntegrationProvider) {
    return this.prisma.integration.findUnique({ where: { provider_name: { provider, name: provider } } });
  }

  async runAll(options: SyncOptions = {}) {
    if (this.syncRunning) {
      return { ok: false, error: 'Sincronização já em andamento' };
    }
    this.syncRunning = true;
    const results: Array<{ entity: string; provider: string; status: string; processed: number }> = [];
    try {
      if (options.provider && options.provider !== 'ODVIX' && this.odvix.enabled) {
        // pular odvix
      } else if (!options.provider || options.provider === 'ODVIX') {
        if (this.odvix.enabled) {
          results.push(await this.syncEntity('PRODUTO', 'ODVIX', options.full ? options.full : false));
          results.push(await this.syncEntity('CLIENTE', 'ODVIX', options.full ? options.full : false));
          results.push(await this.syncEntity('VENDEDOR', 'ODVIX', options.full ? options.full : false));
          results.push(await this.syncEntity('PEDIDO', 'ODVIX', options.full ? options.full : false));
          results.push(await this.syncEntity('ESTOQUE', 'ODVIX', options.full ? options.full : false));
        }
      }
      if (!options.provider || options.provider === 'MERCOS') {
        if (this.mercos.enabled) {
          results.push(await this.syncEntity('PRODUTO', 'MERCOS', options.full ? options.full : false));
          results.push(await this.syncEntity('CLIENTE', 'MERCOS', options.full ? options.full : false));
          results.push(await this.syncEntity('VENDEDOR', 'MERCOS', options.full ? options.full : false));
          results.push(await this.syncEntity('PEDIDO', 'MERCOS', options.full ? options.full : false));
        }
      }
      return { ok: true, results };
    } catch (err) {
      this.logger.error('Falha na sincronização', err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      this.syncRunning = false;
    }
  }

  async retryFailed() {
    const jobs = await this.prisma.syncJob.findMany({
      where: { status: { in: ['FAILED', 'PARTIAL'] } },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    const results: Array<{ entity: string; provider: string; status: string; processed: number; created?: number; updated?: number; errors?: number; error?: string }> = [];
    for (const job of jobs) {
      results.push(
        await this.syncEntity(job.entity as 'PRODUTO' | 'CLIENTE' | 'VENDEDOR' | 'PEDIDO' | 'ESTOQUE', (job.integrationId
          ? (await this.prisma.integration.findUnique({ where: { id: job.integrationId } }))?.provider
          : 'ODVIX') as IntegrationProvider, false),
      );
    }
    return { ok: true, reprocessed: jobs.length, results };
  }

  async status() {
    const integrations = await this.prisma.integration.findMany({
      include: {
        syncJobs: { orderBy: { createdAt: 'desc' }, take: 5 },
        integrationLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    const lastSyncs = await this.prisma.syncJob.groupBy({
      by: ['integrationId', 'entity'],
      _max: { finishedAt: true },
    });
    return { integrations, lastSyncs };
  }

  /** Saúde ao vivo: configuração presente (enabled) e último sync conectado (CONNECTED). */
  async health() {
    const odvixEnabled = this.odvix.enabled;
    const mercosEnabled = this.mercos.enabled;

    const [odvixRow, mercosRow] = await Promise.all([
      this.prisma.integration.findUnique({
        where: { provider_name: { provider: 'ODVIX', name: 'ODVIX' } },
      }),
      this.prisma.integration.findUnique({
        where: { provider_name: { provider: 'MERCOS', name: 'MERCOS' } },
      }),
    ]);

    const odvixOk = odvixEnabled && odvixRow?.status === 'CONNECTED';
    const mercosOk = mercosEnabled && mercosRow?.status === 'CONNECTED';

    return {
      odvix: { enabled: odvixEnabled, ok: odvixOk },
      mercos: { enabled: mercosEnabled, ok: mercosOk },
      allOk: odvixOk && mercosOk,
    };
  }

  // ===================== Motor por entidade =====================

  private async syncEntity(
    entity: 'PRODUTO' | 'CLIENTE' | 'VENDEDOR' | 'PEDIDO' | 'ESTOQUE',
    provider: IntegrationProvider,
    full: boolean,
  ) {
    const integration = await this.getIntegration(provider);
    // Fonte principal da entidade decide se o sync será aplicado como fonte ativa
    const sourceFor = await this.registry.getSourceFor(
      entity as keyof typeof DEFAULT_SOURCE_CONFIG,
    );
    void sourceFor;

    const lastSync = integration
      ? await this.prisma.syncJob.findFirst({
          where: { integrationId: integration.id, entity, status: 'SUCCESS' },
          orderBy: { finishedAt: 'desc' },
        })
      : null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fetch: Promise<any>;
      const syncFrom = !full && lastSync?.finishedAt
        ? lastSync.finishedAt.toISOString()
        : undefined;

      if (provider === 'ODVIX') {
        fetch =
          entity === 'PRODUTO' ? this.odvix.getProducts(syncFrom)
          : entity === 'CLIENTE' ? this.odvix.getCustomers(syncFrom)
          : entity === 'VENDEDOR' ? this.odvix.getSalespeople()
          : entity === 'ESTOQUE' ? this.odvix.getStock()
          : this.odvix.getOrders(syncFrom);
      } else {
        fetch =
          entity === 'PRODUTO' ? this.mercos.listProducts(syncFrom)
          : entity === 'CLIENTE' ? this.mercos.listCustomers(syncFrom)
          : entity === 'VENDEDOR' ? this.mercos.listSalespeople()
          : this.mercos.listOrders(syncFrom);
      }

      const result = await fetch;
      if (!result.ok) {
        throw new Error(result.error ?? 'Falha ao buscar dados');
      }

      const rawRecords = result.data ?? [];
      const job = await this.prisma.syncJob.create({
        data: {
          integrationId: integration?.id,
          type: full ? 'FULL' : 'INCREMENTAL',
          entity,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      let created = 0;
      let updated = 0;
      let errors = 0;
      for (const raw of rawRecords) {
        try {
          let normalized: { created: boolean; updated: boolean };
          if (entity === 'PRODUTO') {
            const item = this.normalizeProduct(raw, provider);
            normalized = await this.upsertProduct(item);
          } else if (entity === 'CLIENTE') {
            const item = this.normalizeCustomer(raw, provider);
            normalized = await this.upsertCustomer(item);
          } else if (entity === 'VENDEDOR') {
            normalized = await this.upsertSalesperson(raw, provider);
          } else if (entity === 'ESTOQUE') {
            normalized = await this.upsertStock(raw);
          } else {
            normalized = await this.upsertOrder(raw, provider);
          }
          if (normalized.created) created++;
          if (normalized.updated) updated++;
        } catch (err) {
          errors++;
          this.logger.warn(`Erro ao processar ${entity}[${provider}]: ${err instanceof Error ? err.message : err}`);
        }
      }

      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: errors === rawRecords.length && rawRecords.length > 0 ? 'FAILED' : errors > 0 ? 'PARTIAL' : 'SUCCESS',
          recordsProcessed: rawRecords.length,
          recordsCreated: created,
          recordsUpdated: updated,
          errors,
          finishedAt: new Date(),
          errorDetails: errors ? { errors } : undefined,
        },
      });
      if (integration) {
        await this.prisma.integration.update({
          where: { id: integration.id },
          data: { lastSyncAt: new Date(), status: 'CONNECTED' },
        });
      }

      return { entity, provider, status: 'SUCCESS', processed: rawRecords.length, created, updated, errors };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha sync ${entity}[${provider}]: ${message}`);
      if (integration) {
        await this.prisma.integration.update({
          where: { id: integration.id },
          data: { status: 'ERROR', lastSyncError: message },
        });
        await this.prisma.syncJob.create({
          data: {
            integrationId: integration.id,
            type: full ? 'FULL' : 'INCREMENTAL',
            entity,
            status: 'FAILED',
            errors: 1,
            errorDetails: { message },
            finishedAt: new Date(),
          },
        });
      }
      return { entity, provider, status: 'FAILED', processed: 0, error: message };
    }
  }

  // ================ Normalização / identity resolution ================

  private normalizeProduct(raw: Record<string, unknown>, provider: IntegrationProvider): NormalizedProduct {
    if (provider === 'MERCOS') {
      const r = raw as Record<string, unknown>;
      return {
        code: String(r.codigo ?? r.id ?? ''),
        name: String(r.nome ?? r.descricao ?? ''),
        category: (r.categoria as { nome?: string })?.nome,
        unit: (r.unidade as string) ?? undefined,
        price: Number(r.preco_tabela ?? 0) || undefined,
        stock: Number(r.saldo_estoque ?? 0),
        barcode: (r.codigo_barras as string) ?? undefined,
        externalMapping: { mercos: String(r.id ?? '') },
        source: 'MERCOS',
      };
    }
    // ODVIX
    const c = this.odvixResponse(raw);
    return {
      code: String(c.codigo ?? ''),
      name: String(c.nome ?? c.descricao ?? c.DESCRICAO ?? ''),
      category: (c.categoria ?? c.CATEGORIA) as string,
      unit: (c.unidade ?? c.UNIDADE) as string,
      price: Number(c.precoVenda ?? c.PRECOVENDA ?? 0) || undefined,
      stock: Number(c.saldo ?? c.SALDO ?? 0),
      barcode: (c.ean ?? c.EAN) as string,
      externalMapping: { odvix: String(c.id ?? c.codigo ?? '') },
      source: 'ODVIX',
    };
  }

  private normalizeCustomer(raw: Record<string, unknown>, provider: IntegrationProvider): NormalizedCustomer {
    if (provider === 'MERCOS') {
      const r = raw as Record<string, unknown>;
      const email = (r.emails as Array<{ email: string }>)?.find(Boolean)?.email;
      const phones = r.telefones as Array<{ numero: string }> | undefined;
      return {
        name: String(r.nome_fantasia ?? r.razao_social ?? ''),
        legalName: (r.razao_social as string) ?? undefined,
        document: (r.cnpj as string) ?? undefined,
        email: email ?? undefined,
        phone: phones?.[0]?.numero,
        whatsapp: (r.whatsapp as string) ?? phones?.find((p) => p.numero)?.numero,
        city: (r.cidade as string) ?? undefined,
        state: (r.estado as string) ?? undefined,
        address: (r.rua as string) ?? undefined,
        number: (r.numero as string) ?? undefined,
        neighborhood: (r.bairro as string) ?? undefined,
        zip: (r.cep as string) ?? undefined,
        externalMapping: { mercos: String(r.id ?? '') },
        source: 'MERCOS',
      };
    }
    // ODVIX
    const c = this.odvixResponse(raw);
    return {
      name: String(c.nome ?? c.RAZAOSOCIAL ?? ''),
      legalName: (c.razaoSocial ?? c.RAZAOSOCIAL) as string,
      document: (c.cnpj ?? c.CNPJ ?? c.cpf ?? c.CPF) as string,
      email: (c.email ?? c.EMAIL) as string,
      phone: (c.telefone ?? c.TELEFONE) as string,
      whatsapp: (c.celular ?? c.CELULAR) as string,
      city: (c.cidade ?? c.CIDADE) as string,
      state: (c.uf ?? c.UF) as string,
      address: (c.endereco ?? c.ENDERECO) as string,
      number: (c.numero ?? c.NUMERO) as string,
      neighborhood: (c.bairro ?? c.BAIRRO) as string,
      zip: (c.cep ?? c.CEP) as string,
      externalMapping: { odvix: String(c.id ?? c.codigo ?? '') },
      source: 'ODVIX',
    };
  }

  async upsertCustomer(item: NormalizedCustomer) {
    const document = item.document ? item.document.replace(/\D/g, '') : null;
    const whatsapp = item.whatsapp ? item.whatsapp.replace(/\D/g, '') : null;

    // Identity resolution: CNPJ/CPF ou whatsapp ou id externo
    let existing: Customer | null = null;
    if (document) existing = await this.prisma.customer.findFirst({ where: { document } });
    if (!existing && whatsapp) existing = await this.prisma.customer.findFirst({ where: { whatsapp } });
    if (!existing && item.externalMapping.mercos) {
      existing = await this.prisma.customer.findFirst({ where: { externalIdMercos: item.externalMapping.mercos } });
    }
    if (!existing && item.externalMapping.odvix) {
      existing = await this.prisma.customer.findFirst({ where: { externalIdOdvix: item.externalMapping.odvix } });
    }

    let cityId: string | undefined;
    if (item.city && item.state) {
      const city = await this.prisma.city.upsert({
        where: { name_state: { name: item.city, state: item.state } },
        create: { name: item.city, state: item.state },
        update: {},
      });
      cityId = city.id;
    }

    const data = {
      name: item.name || existing?.name || 'Sem nome',
      legalName: item.legalName ?? existing?.legalName,
      document: document ?? existing?.document,
      email: item.email ?? existing?.email,
      phone: item.phone ?? existing?.phone,
      whatsapp: whatsapp ?? existing?.whatsapp,
      address: item.address ?? existing?.address,
      addressNumber: item.number ?? existing?.addressNumber,
      neighborhood: item.neighborhood ?? existing?.neighborhood,
      zipCode: item.zip ?? existing?.zipCode,
      cityId: cityId ?? existing?.cityId,
      sourceSystem: item.source,
      externalIdOdvix: item.externalMapping.odvix ?? existing?.externalIdOdvix,
      externalIdMercos: item.externalMapping.mercos ?? existing?.externalIdMercos,
    };

    if (existing) {
      // regra de conflito: só aplica se a fonte for a principal ou o registro está sem fonte superior
      const sourceFor = await this.registry.getSourceFor('CLIENTE');
      const isPrimary = item.source === sourceFor;
      const current = await this.prisma.customer.findUnique({ where: { id: existing.id } });
      if (!isPrimary && current?.sourceSystem && current.sourceSystem !== item.source) {
        // não sobrescreve da fonte secundária
        if (!item.externalMapping.odvix && !item.externalMapping.mercos) return { created: false, updated: false };
      }
      await this.prisma.customer.update({ where: { id: existing.id }, data });
      return { created: false, updated: true };
    }

    const created = await this.prisma.customer.create({ data });
    await this.prisma.customerEvent.create({
      data: {
        customerId: created.id,
        type: 'SYSTEM',
        title: `Cliente importado de ${item.source}`,
      },
    });
    return { created: true, updated: false };
  }

  async upsertProduct(item: NormalizedProduct) {
    let existing: Product | null = null;
    if (item.externalMapping.mercos) {
      existing = await this.prisma.product.findFirst({ where: { externalIdMercos: item.externalMapping.mercos } });
    }
    if (!existing && item.externalMapping.odvix) {
      existing = await this.prisma.product.findFirst({ where: { externalIdOdvix: item.externalMapping.odvix } });
    }
    if (!existing && item.code) {
      existing = await this.prisma.product.findFirst({ where: { code: item.code } });
    }

    // categoria
    let categoryId: string | undefined;
    if (item.category) {
      const cat = await this.prisma.productCategory.upsert({
        where: { name: item.category },
        create: { name: item.category },
        update: {},
      });
      categoryId = cat.id;
    }

    const data = {
      code: item.code || existing?.code || `ext-${item.externalMapping.odvix ?? item.externalMapping.mercos ?? ''}`,
      name: item.name || existing?.name || 'Sem nome',
      categoryId: categoryId ?? existing?.categoryId,
      unit: item.unit ?? existing?.unit,
      barcode: item.barcode ?? existing?.barcode,
      sourceSystem: item.source,
      externalIdOdvix: item.externalMapping.odvix ?? existing?.externalIdOdvix,
      externalIdMercos: item.externalMapping.mercos ?? existing?.externalIdMercos,
    };

    if (existing) {
      await this.prisma.product.update({ where: { id: existing.id }, data });
      if (item.price && item.price > 0) {
        const existingPrice = await this.prisma.price.findFirst({
          where: { productId: existing.id, active: true, priceTable: 'default' },
        });
        if (existingPrice) {
          await this.prisma.price.update({ where: { id: existingPrice.id }, data: { value: item.price } });
        } else {
          await this.prisma.price.create({
            data: { productId: existing.id, value: item.price, priceTable: 'default', effectiveFrom: new Date() },
          });
        }
      }
      if (typeof item.stock === 'number') {
        await this.prisma.stock.upsert({
          where: { productId_warehouse: { productId: existing.id, warehouse: 'principal' } },
          create: { productId: existing.id, quantity: item.stock, warehouse: 'principal' },
          update: { quantity: item.stock, syncedAt: new Date() },
        });
      }
      return { created: false, updated: true };
    }

    const created = await this.prisma.product.create({ data });
    if (item.price && item.price > 0) {
      await this.prisma.price.create({
        data: { productId: created.id, value: item.price, priceTable: 'default', effectiveFrom: new Date() },
      });
    }
    if (typeof item.stock === 'number') {
      await this.prisma.stock.create({
        data: { productId: created.id, quantity: item.stock, warehouse: 'principal' },
      });
    }
    return { created: true, updated: false };
  }

  async upsertSalesperson(raw: Record<string, unknown>, provider: IntegrationProvider) {
    if (provider === 'ODVIX') {
      const c = this.odvixResponse(raw);
      const id = String(c.id ?? c.codigo ?? c.VENDEDORID ?? '');
      if (!id) return { created: false, updated: false };
      const existing = await this.prisma.salesperson.findFirst({
        where: { OR: [{ externalIdOdvix: id }, { code: String(c.codigo ?? '') }] },
      });
      const data = {
        name: String(c.nome ?? c.NOME ?? 'Representante'),
        code: String(c.codigo ?? ''),
        email: (c.email ?? c.EMAIL) as string | undefined,
        phone: (c.telefone ?? c.TELEFONE) as string | undefined,
        externalIdOdvix: id,
      };
      if (existing) {
        await this.prisma.salesperson.update({ where: { id: existing.id }, data });
        return { created: false, updated: true };
      }
      await this.prisma.salesperson.create({ data });
      return { created: true, updated: false };
    }

    if (provider === 'MERCOS') {
      const r = raw as Record<string, unknown>;
      const id = String(r.id ?? '');
      if (!id) return { created: false, updated: false };
      const existing = await this.prisma.salesperson.findFirst({ where: { externalIdMercos: id } });
      const data = {
        name: String(r.nome ?? r.NOME ?? 'Representante'),
        email: (r.email as string) ?? undefined,
        phone: (r.telefone as string) ?? undefined,
        externalIdMercos: id,
      };
      if (existing) {
        await this.prisma.salesperson.update({ where: { id: existing.id }, data });
        return { created: false, updated: true };
      }
      await this.prisma.salesperson.create({ data });
      return { created: true, updated: false };
    }
    return { created: false, updated: false };
  }

  async upsertStock(raw: Record<string, unknown>) {
    const c = this.odvixResponse(raw);
    const code = String(c.codigo ?? c.produto ?? c.PRODUTO ?? '');
    if (!code) return { created: false, updated: false };
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ code }, { externalIdOdvix: code }] },
    });
    if (!product) return { created: false, updated: false };
    const qty = Number(c.saldo ?? c.SALDO ?? c.quantidade ?? 0);
    await this.prisma.stock.upsert({
      where: { productId_warehouse: { productId: product.id, warehouse: 'principal' } },
      create: { productId: product.id, quantity: qty, warehouse: 'principal' },
      update: { quantity: qty, syncedAt: new Date() },
    });
    return { created: false, updated: true };
  }

  async upsertOrder(raw: Record<string, unknown>, provider: IntegrationProvider) {
    // Simplificado: apenas registra os pedidos que vierem com cliente mapeado.
    // Enriquecimento completo fica na FASE 2 (WhatsApp).
    if (provider === 'MERCOS') {
      const r = raw as Record<string, unknown>;
      const externalId = String(r.id ?? '');
      if (!externalId) return { created: false, updated: false };
      const existing = await this.prisma.order.findFirst({ where: { externalIdMercos: externalId } });
      if (existing) return { created: false, updated: false };
      const customer = await this.prisma.customer.findFirst({
        where: { externalIdMercos: String(r.cliente_id ?? '') },
      });
      if (!customer) return { created: false, updated: false };

      const items = (r.itens as Array<Record<string, unknown>> | undefined) ?? [];
      await this.prisma.order.create({
        data: {
          customerId: customer.id,
          source: 'REPRESENTATIVE',
          status: ((r.status_faturamento === 2 ? 'FATURADO' : 'CONFIRMADO') as never),
          total: Number(r.valor_total ?? 0),
          subtotal: Number(r.valor_total ?? 0),
          externalIdMercos: externalId,
          erpStatus: `mercos-${r.status ?? ''}`,
          billedAt: (r.data_faturamento as string) ? new Date(r.data_faturamento as string) : null,
          createdAt: (r.data_emissao as string) ? new Date(r.data_emissao as string) : new Date(),
          items: {
            create: items.map((it) => ({
              productId: it.produto_id as string,
              quantity: Number(it.quantidade ?? 0),
              unitPrice: Number(it.preco_liquido ?? it.preco_tabela ?? 0),
              total: Number(it.preco_liquido ?? it.preco_tabela ?? 0) * Number(it.quantidade ?? 0),
            })),
          },
        },
      });
      return { created: true, updated: false };
    }
    return { created: false, updated: false };
  }

  // Util: lê resposta ODVIX respeitando chaves case-insensitive nas formas comuns
  private odvixResponse(raw: unknown): Record<string, unknown> {
    if (Array.isArray(raw)) return {};
    return (raw ?? {}) as Record<string, unknown>;
  }

  /** Envia pedido local ao ERP (sistema → ODVIX/Mercos). */
  async pushOrderToErp(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } }, customer: true },
    });
    if (!order) throw new Error('Pedido não encontrado');

    const primarySource = await this.registry.getSourceFor('PEDIDO');
    if (primarySource === 'MERCOS' && this.mercos.enabled && !order.externalIdMercos) {
      const mercosCustomer = await this.prisma.customer.findUnique({
        where: { id: order.customerId },
        select: { externalIdMercos: true },
      });
      if (!mercosCustomer?.externalIdMercos) {
        return { ok: false, error: 'Cliente sem ID Mercos (é preciso sincronizar clientes antes)' };
      }
      const items = order.items.map((i) => ({
        produto_id: Number(i.product.externalIdMercos ?? 0),
        preco_tabela: i.unitPrice.toNumber(),
        preco_liquido: i.unitPrice.toNumber() - i.discount.toNumber(),
        quantidade: i.quantity.toNumber(),
      }));
      const res = await this.mercos.createOrder({
        cliente_id: Number(mercosCustomer.externalIdMercos),
        condicao_pagamento: order.paymentTerm ?? undefined,
        itens: items,
        data_emissao: new Date().toISOString().slice(0, 10),
      });
      if (!res.ok) {
        throw new Error(res.error ?? 'Falha ao enviar pedido para Mercos');
      }
      await this.prisma.order.update({
        where: { id: order.id },
        data: { externalIdMercos: String(res.id ?? ''), erpStatus: 'ENVIADO_MERCOS', erpSyncAt: new Date(), status: 'ENVIADO_ERP' },
      });
      return { ok: true, provider: 'MERCOS', externalId: res.id };
    }

    if (this.odvix.enabled && !order.externalIdOdvix) {
      await this.odvix.pushOrder({
        clienteId: order.customer.externalIdOdvix ?? order.customer.document ?? undefined,
        numero: String(order.number ?? ''),
        data: order.createdAt.toISOString().slice(0, 10),
        valorTotal: order.total.toNumber(),
        condicaoPagamento: order.paymentTerm ?? undefined,
        itens: order.items.map((i) => ({
          codigoProduto: i.product.code,
          quantidade: i.quantity.toNumber(),
          valorUnitario: i.unitPrice.toNumber(),
          desconto: i.discount.toNumber(),
        })),
      });
      return { ok: true, provider: 'ODVIX' };
    }

    return { ok: false, error: 'Integração ERP não configurada ou pedido já sincronizado' };
  }

  /** Recalcula classificação de todos os clientes (job periódico). */
  async recalculateAllClassifications() {
    const customers = await this.prisma.customer.findMany({ select: { id: true } });
    let updated = 0;
    for (const c of customers) {
      try {
        await this.intelligence.applyClassification(c.id);
        updated++;
      } catch {
        // segue para o próximo
      }
    }
    return { updated, total: customers.length };
  }
}