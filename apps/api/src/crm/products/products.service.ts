import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma, OrderItem } from '@prisma/client';

export interface ProductListQuery {
  page?: number;
  perPage?: number;
  search?: string;
  categoryId?: string;
  active?: boolean;
  inStock?: boolean;
}

export interface CreateProductInput {
  code: string;
  name: string;
  description?: string;
  categoryId?: string;
  brand?: string;
  unit?: string;
  packaging?: string;
  barcode?: string;
  imageUrl?: string;
  price?: number;
  stockQuantity?: number;
  marginPct?: number;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    category: true,
    prices: { where: { active: true }, orderBy: { effectiveFrom: 'desc' as const } },
    stocks: true,
  };

  async list(query: ProductListQuery = {}) {
    const page = Number(query.page ?? 1);
    const perPage = Math.min(Math.max(Number(query.perPage ?? 20), 1), 100);
    const where: Prisma.ProductWhereInput = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search } },
      ];
    }
    if (query.categoryId) where.categoryId = query.categoryId;
    if (typeof query.active === 'boolean') where.active = query.active;
    if (query.inStock) where.stocks = { some: { quantity: { gt: 0 } } };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: this.include,
        orderBy: { name: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      data,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async findById(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: this.include });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }

  async findByCode(code: string) {
    return this.prisma.product.findUnique({ where: { code }, include: this.include });
  }

  async create(input: CreateProductInput) {
    const data: Prisma.ProductCreateInput = {
      code: input.code,
      name: input.name,
      description: input.description,
      brand: input.brand,
      unit: input.unit,
      packaging: input.packaging,
      barcode: input.barcode,
      imageUrl: input.imageUrl,
      marginPct: input.marginPct,
      category: input.categoryId ? { connect: { id: input.categoryId } } : undefined,
      prices: input.price
        ? {
            create: {
              value: input.price,
              effectiveFrom: new Date(),
            },
          }
        : undefined,
      stocks: typeof input.stockQuantity === 'number'
        ? {
            create: {
              quantity: input.stockQuantity,
            },
          }
        : undefined,
    };
    return this.prisma.product.create({ data, include: this.include });
  }

  async update(id: string, input: Partial<CreateProductInput>) {
    await this.findById(id);
    const data: Prisma.ProductUpdateInput = {
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.brand !== undefined ? { brand: input.brand } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.packaging !== undefined ? { packaging: input.packaging } : {}),
      ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.marginPct !== undefined ? { marginPct: input.marginPct } : {}),
      ...(input.categoryId !== undefined
        ? { category: input.categoryId ? { connect: { id: input.categoryId } } : { disconnect: true } }
        : {}),
    };
    return this.prisma.product.update({ where: { id }, data, include: this.include });
  }

  /** Se preço informado, cria nova versão vigente. */
  async setPrice(productId: string, value: number, priceTable = 'default') {
    await this.findById(productId);
    await this.prisma.price.updateMany({
      where: { productId, active: true },
      data: { active: false, effectiveTo: new Date() },
    });
    return this.prisma.price.create({
      data: { productId, value, priceTable, effectiveFrom: new Date() },
    });
  }

  async setStock(productId: string, quantity: number, warehouse = 'principal') {
    await this.findById(productId);
    return this.prisma.stock.upsert({
      where: { productId_warehouse: { productId, warehouse } },
      create: { productId, quantity, warehouse },
      update: { quantity, syncedAt: new Date() },
    });
  }

  async getLowStock(minQuantity = 5) {
    return this.prisma.stock.findMany({
      where: { quantity: { lte: minQuantity } },
      include: { product: { select: { id: true, name: true, code: true } } },
      orderBy: { quantity: 'asc' },
      take: 50,
    });
  }

  /** Preço atual vigente de um produto (prioriza tabela informada). */
  async currentPrice(productId: string, priceTable = 'default') {
    const price = await this.prisma.price.findFirst({
      where: { productId, active: true, ...(priceTable ? { priceTable } : {}) },
      orderBy: { effectiveFrom: 'desc' },
    });
    return price ?? null;
  }

  async validateStockAndPrice(items: { productId: string; quantity: number }[]) {
    const results: Array<{
      productId: string;
      ok: boolean;
      reason?: string;
      price?: number;
      available?: number;
    }> = [];
    for (const item of items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: { stocks: true, prices: { where: { active: true }, orderBy: { effectiveFrom: 'desc' } } },
      });
      if (!product) {
        results.push({ productId: item.productId, ok: false, reason: 'PRODUTO_NAO_ENCONTRADO' });
        continue;
      }
      const stockQty = product.stocks.reduce((s, st) => s + st.quantity.toNumber(), 0);
      const price = product.prices[0]?.value?.toNumber() ?? undefined;
      if (stockQty < item.quantity) {
        results.push({
          productId: item.productId,
          ok: false,
          reason: 'ESTOQUE_INSUFICIENTE',
          available: stockQty,
          price,
        });
        continue;
      }
      if (!price) {
        results.push({ productId: item.productId, ok: false, reason: 'SEM_PRECO', available: stockQty });
        continue;
      }
      results.push({ productId: item.productId, ok: true, price, available: stockQty });
    }
    return results;
  }
}

export type OrderItemWithProduct = OrderItem & { product: { id: string; name: string; code: string } };