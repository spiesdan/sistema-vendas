import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class PublicCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async storeInfo() {
    const name = (await this.settings.get('general.company_name')) ?? 'Comercial Ops';
    let whatsapp = (await this.settings.get('general.whatsapp_business')) ?? '';
    whatsapp = String(whatsapp).replace(/[^\d]/g, '');
    const priceTable = (await this.settings.get('catalog.price_table')) ?? 'default';
    return { storeName: String(name), whatsapp, priceTable: String(priceTable) };
  }

  private countWhere() {
    return {
      active: true,
    } as never;
  }

  async list(query: { query?: string; category?: string; priceTable?: string }) {
    const store = await this.storeInfo();
    const priceTable = query.priceTable || store.priceTable;
    const where: Record<string, unknown> = {};
    if (typeof query.category === 'string' && query.category.trim()) {
      where.category = { name: { contains: query.category.trim(), mode: 'insensitive' } };
    }
    if (typeof query.query === 'string' && query.query.trim()) {
      where.OR = [
        { name: { contains: query.query.trim(), mode: 'insensitive' as const } },
        { brand: { contains: query.query.trim(), mode: 'insensitive' as const } },
        { code: { contains: query.query.trim(), mode: 'insensitive' as const } },
      ];
    }
    const products = await this.prisma.product.findMany({
      where: { ...where, active: true },
      orderBy: { name: 'asc' },
      include: {
        category: true,
        prices: {
          where: {
            active: true,
            priceTable: { equals: null },
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
        stocks: true,
      },
    });

    return {
      store,
      total: products.length,
      items: products.map((p) => this.mapProduct(p)),
    };
  }

  async detail(id: string) {
    const store = await this.storeInfo();
    const product = await this.prisma.product.findFirst({
      where: { id, active: true },
      include: {
        category: true,
        prices: {
          where: { active: true, priceTable: { equals: null } },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
        stocks: true,
      },
    });
    if (!product) return null;

    const base = `http://localhost:3000/catalog/${product.id}`;
    const waText = `Olá! Vi o produto ${product.name} (${product.code}) no catálogo da ${store.storeName} e gostaria de comprar.`;
    return {
      product: this.mapProduct(product),
      store,
      buyUrl: store.whatsapp ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(waText)}` : null,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(base)}`,
      catalogUrl: base,
    };
  }

  private mapProduct(p: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    brand: string | null;
    unit: string | null;
    packaging: string | null;
    category: { name: string } | null;
    prices: Array<{ value: { toNumber(): number } }>;
    stocks: Array<{ quantity: { toNumber(): number }; reserved: { toNumber(): number } }>;
  }) {
    const price = p.prices[0]?.value?.toNumber?.() ?? null;
    const available = p.stocks.reduce((acc, s) => acc + (s.quantity.toNumber() - s.reserved.toNumber()), 0);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      brand: p.brand,
      unit: p.unit,
      packaging: p.packaging,
      category: p.category?.name ?? null,
      price,
      available: Math.max(0, Math.round(available)),
      inStock: available > 0,
    };
  }
}