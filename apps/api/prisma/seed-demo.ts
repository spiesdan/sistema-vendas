import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

const REGIONS = [
  { code: 'NORTE_SC', name: 'Norte de Santa Catarina' },
  { code: 'GRANDE_CURITIBA', name: 'Grande Curitiba' },
  { code: 'FLORIPA', name: 'Florianópolis e região' },
];

const CITIES: Array<{ name: string; state: string; region: string; lat: number; lng: number }> = [
  { name: 'Canoinhas', state: 'SC', region: 'NORTE_SC', lat: -26.177, lng: -50.39 },
  { name: 'Porto União', state: 'SC', region: 'NORTE_SC', lat: -26.238, lng: -51.08 },
  { name: 'Mafra', state: 'SC', region: 'NORTE_SC', lat: -26.116, lng: -49.807 },
  { name: 'Três Barras', state: 'SC', region: 'NORTE_SC', lat: -26.11, lng: -50.32 },
  { name: 'Itaiópolis', state: 'SC', region: 'NORTE_SC', lat: -26.33, lng: -49.91 },
  { name: 'Papanduva', state: 'SC', region: 'NORTE_SC', lat: -26.42, lng: -50.15 },
  { name: 'São Bento do Sul', state: 'SC', region: 'NORTE_SC', lat: -26.25, lng: -49.38 },
  { name: 'Curitiba', state: 'PR', region: 'GRANDE_CURITIBA', lat: -25.4284, lng: -49.2733 },
  { name: 'Pinhais', state: 'PR', region: 'GRANDE_CURITIBA', lat: -25.445, lng: -49.192 },
  { name: 'São José dos Pinhais', state: 'PR', region: 'GRANDE_CURITIBA', lat: -25.535, lng: -49.206 },
  { name: 'Araucária', state: 'PR', region: 'GRANDE_CURITIBA', lat: -25.593, lng: -49.409 },
  { name: 'Campo Largo', state: 'PR', region: 'GRANDE_CURITIBA', lat: -25.459, lng: -49.53 },
  { name: 'Florianópolis', state: 'SC', region: 'FLORIPA', lat: -27.595, lng: -48.548 },
  { name: 'São José', state: 'SC', region: 'FLORIPA', lat: -27.614, lng: -48.637 },
  { name: 'Palhoça', state: 'SC', region: 'FLORIPA', lat: -27.645, lng: -48.668 },
];

const PRODUCTS: Array<{ code: string; name: string; unit: string; packaging: string; price: number; stock: number; category: string }> = [
  { code: 'DET5', name: 'Detergente Neutro 5L', unit: 'UN', packaging: 'Balde 5L', price: 18.9, stock: 120, category: 'Limpeza' },
  { code: 'DES5', name: 'Desinfetante Pinho 5L', unit: 'UN', packaging: 'Balde 5L', price: 21.5, stock: 95, category: 'Limpeza' },
  { code: 'SAPC', name: 'Sabão em Pó 5kg', unit: 'UN', packaging: 'Pacote 5kg', price: 34.9, stock: 60, category: 'Limpeza' },
  { code: 'ALC70', name: 'Álcool 70% 5L', unit: 'UN', packaging: 'Galão 5L', price: 27.9, stock: 88, category: 'Limpeza' },
  { code: 'AGS5', name: 'Água Sanitária 5L', unit: 'UN', packaging: 'Galão 5L', price: 12.9, stock: 150, category: 'Limpeza' },
  { code: 'MULTI5', name: 'Limpa Tudo Multiuso 5L', unit: 'UN', packaging: 'Galão 5L', price: 16.5, stock: 110, category: 'Limpeza' },
  { code: 'ESP12', name: 'Esponja Dupla Face (cx 12)', unit: 'CX', packaging: 'Caixa 12un', price: 24.9, stock: 70, category: 'Utilidades' },
  { code: 'LUV12', name: 'Luva de Látex (cx 12)', unit: 'CX', packaging: 'Caixa 12un', price: 32.0, stock: 40, category: 'Utilidades' },
  { code: 'SAC30', name: 'Saco de Lixo 30L (cx 100)', unit: 'CX', packaging: 'Caixa 100un', price: 29.9, stock: 4, category: 'Utilidades' },
  { code: 'ACU5', name: 'Açúcar Cristal 5kg', unit: 'UN', packaging: 'Pacote 5kg', price: 19.5, stock: 200, category: 'Alimentos' },
  { code: 'CAF500', name: 'Café Torrado 500g', unit: 'UN', packaging: 'Pacote 500g', price: 22.9, stock: 75, category: 'Alimentos' },
  { code: 'OLE900', name: 'Óleo de Soja 900ml (cx 15)', unit: 'CX', packaging: 'Caixa 15un', price: 47.5, stock: 55, category: 'Alimentos' },
  { code: 'FAR5', name: 'Farinha de Trigo 5kg', unit: 'UN', packaging: 'Pacote 5kg', price: 16.9, stock: 130, category: 'Alimentos' },
  { code: 'ARZ5', name: 'Arroz Tipo 1 5kg', unit: 'UN', packaging: 'Pacote 5kg', price: 28.9, stock: 180, category: 'Alimentos' },
];

const CUSTOMERS: Array<{
  name: string;
  city: string;
  status: string;
  tier: string;
  whatsapp: string;
  email: string;
  phone: string;
  lastOrderDaysAgo: number;
  avgIntervalDays: number;
  score: number;
}> = [
  { name: 'Supermercado Bom Preço', city: 'Canoinhas', status: 'VIP', tier: 'VIP', whatsapp: '5547991010001', email: 'contato@bompreco.com.br', phone: '4736240001', lastOrderDaysAgo: 3, avgIntervalDays: 12, score: 95 },
  { name: 'Padaria Central', city: 'Canoinhas', status: 'ATIVO', tier: 'HIGH', whatsapp: '5547991010002', email: 'vendas@padariacentral.com.br', phone: '4736240002', lastOrderDaysAgo: 8, avgIntervalDays: 20, score: 82 },
  { name: 'Restaurante Sabor Caseiro', city: 'Mafra', status: 'ATIVO', tier: 'MEDIUM', whatsapp: '5547991010003', email: 'saborcaseiro@mail.com', phone: '4736420003', lastOrderDaysAgo: 5, avgIntervalDays: 15, score: 78 },
  { name: 'Mercado Oliveira', city: 'Porto União', status: 'EM_RISCO', tier: 'MEDIUM', whatsapp: '5542991010004', email: 'mercado.oliveira@mail.com', phone: '4235230004', lastOrderDaysAgo: 34, avgIntervalDays: 18, score: 45 },
  { name: 'Distribuidora Nova Era', city: 'Curitiba', status: 'VIP', tier: 'VIP', whatsapp: '5541991010005', email: 'compras@novaera.com.br', phone: '4136430005', lastOrderDaysAgo: 2, avgIntervalDays: 10, score: 98 },
  { name: 'Hotel Serra Verde', city: 'São Bento do Sul', status: 'ATIVO', tier: 'HIGH', whatsapp: '5547991010006', email: 'reservas@serraverde.com', phone: '4736330006', lastOrderDaysAgo: 11, avgIntervalDays: 25, score: 74 },
  { name: 'Lanchonete Ponto Certo', city: 'Itaiópolis', status: 'NOVO', tier: 'LOW', whatsapp: '5547991010007', email: 'pontocerto@mail.com', phone: '4736530007', lastOrderDaysAgo: 1, avgIntervalDays: 0, score: 88 },
  { name: 'Mercado Bom Jesus', city: 'Três Barras', status: 'INATIVO', tier: 'LOW', whatsapp: '5547991010008', email: 'bomjesus@mail.com', phone: '4736240008', lastOrderDaysAgo: 65, avgIntervalDays: 30, score: 22 },
  { name: 'Café da Manhã Gourmet', city: 'Curitiba', status: 'ATIVO', tier: 'MEDIUM', whatsapp: '5541991010009', email: 'cafe@gourmet.com', phone: '4136440009', lastOrderDaysAgo: 6, avgIntervalDays: 14, score: 80 },
  { name: 'Distribuidora PL', city: 'São José dos Pinhais', status: 'EM_RISCO', tier: 'HIGH', whatsapp: '5541991010010', email: 'vendas@pl.com.br', phone: '4133830010', lastOrderDaysAgo: 28, avgIntervalDays: 22, score: 48 },
  { name: 'Supermercado Real', city: 'Florianópolis', status: 'ATIVO', tier: 'HIGH', whatsapp: '5548991010011', email: 'real@real.com.br', phone: '4832440011', lastOrderDaysAgo: 12, avgIntervalDays: 20, score: 76 },
  { name: 'Padaria Pão Dourado', city: 'São José', status: 'EM_RISCO', tier: 'MEDIUM', whatsapp: '5548991010012', email: 'paodourado@mail.com', phone: '4832550012', lastOrderDaysAgo: 40, avgIntervalDays: 22, score: 42 },
  { name: 'Restaurante Toca do Sabor', city: 'Palhoça', status: 'ATIVO', tier: 'MEDIUM', whatsapp: '5548991010013', email: 'toca@sabor.com', phone: '4833450013', lastOrderDaysAgo: 9, avgIntervalDays: 18, score: 71 },
  { name: 'Mercado do Povo', city: 'Pinhais', status: 'INATIVO', tier: 'LOW', whatsapp: '5541991010014', email: 'povo@mail.com', phone: '4136670014', lastOrderDaysAgo: 58, avgIntervalDays: 28, score: 28 },
  { name: 'Açougue Boi Nobre', city: 'Araucária', status: 'ATIVO', tier: 'HIGH', whatsapp: '5541991010015', email: 'boinobre@mail.com', phone: '4136420015', lastOrderDaysAgo: 7, avgIntervalDays: 16, score: 79 },
  { name: 'Mercado São Luiz', city: 'Canoinhas', status: 'ATIVO', tier: 'MEDIUM', whatsapp: '5547991010016', email: 'saoluiz@mail.com', phone: '4736240016', lastOrderDaysAgo: 14, avgIntervalDays: 21, score: 68 },
  { name: 'Empório Colonial', city: 'Porto União', status: 'NOVO', tier: 'LOW', whatsapp: '5542991010017', email: 'emporio@mail.com', phone: '4235230017', lastOrderDaysAgo: 2, avgIntervalDays: 0, score: 84 },
  { name: 'Frigorífico Vale Sul', city: 'Papanduva', status: 'EM_RISCO', tier: 'MEDIUM', whatsapp: '5547991010018', email: 'valesul@mail.com', phone: '4735670018', lastOrderDaysAgo: 31, avgIntervalDays: 19, score: 44 },
  { name: 'Supermercado Popular', city: 'Campo Largo', status: 'ATIVO', tier: 'HIGH', whatsapp: '5541991010019', email: 'popular@mail.com', phone: '4136720019', lastOrderDaysAgo: 4, avgIntervalDays: 12, score: 90 },
  { name: 'Distribuidora Aliança', city: 'Curitiba', status: 'VIP', tier: 'VIP', whatsapp: '5541991010020', email: 'alianca@mail.com', phone: '4136000020', lastOrderDaysAgo: 1, avgIntervalDays: 9, score: 96 },
];

async function main() {
  console.log('Seed demo iniciado');

  const regionIds = new Map<string, string>();
  for (const r of REGIONS) {
    const region = await prisma.region.upsert({
      where: { code: r.code },
      create: r,
      update: {},
    });
    regionIds.set(r.code, region.id);
  }

  const cityIds = new Map<string, string>();
  for (const c of CITIES) {
    const city = await prisma.city.upsert({
      where: { name_state: { name: c.name, state: c.state } },
      create: {
        name: c.name,
        state: c.state,
        latitude: c.lat,
        longitude: c.lng,
        regionId: regionIds.get(c.region),
      },
      update: {},
    });
    cityIds.set(`${c.name}/${c.state}`, city.id);
  }

  const categoryIds = new Map<string, string>();
  for (const cat of ['Limpeza', 'Utilidades', 'Alimentos']) {
    const c = await prisma.productCategory.upsert({
      where: { name: cat },
      create: { name: cat },
      update: {},
    });
    categoryIds.set(cat, c.id);
  }

  const productIds = new Map<string, string>();
  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { code: p.code },
      create: { code: p.code, name: p.name, unit: p.unit, packaging: p.packaging, categoryId: categoryIds.get(p.category) },
      update: {},
    });
    productIds.set(p.code, product.id);
    await prisma.price.create({
      data: { productId: product.id, value: p.price, priceTable: null, active: true },
    });
    await prisma.stock.upsert({
      where: { productId_warehouse: { productId: product.id, warehouse: 'principal' } },
      create: { productId: product.id, quantity: p.stock, reserved: 0, warehouse: 'principal' },
      update: { quantity: p.stock },
    });
  }

  const customerIds: string[] = [];
  let orderSeq = await prisma.order.count();

  for (const c of CUSTOMERS) {
    const city = cityIds.get(`${c.city}/SC`) ?? cityIds.get(`${c.city}/PR`);
    const whatsapp = await prisma.customer.findUnique({ where: { whatsapp: c.whatsapp } });
    if (whatsapp) continue;
    const now = new Date();
    const lastPurchase = new Date(now.getTime() - c.lastOrderDaysAgo * 86400000);
    const customer = await prisma.customer.create({
      data: {
        name: c.name,
        status: c.status as import('@prisma/client').$Enums.CustomerStatus,
        tier: c.tier as import('@prisma/client').$Enums.CustomerTier,
        whatsapp: c.whatsapp,
        email: c.email,
        phone: c.phone,
        cityId: city,
        score: c.score,
        lastPurchaseAt: c.lastOrderDaysAgo === 0 ? null : lastPurchase,
        purchaseFrequency: c.avgIntervalDays,
        reorderProbability: Math.min(0.95, 1 - c.lastOrderDaysAgo / 120),
        churnRisk: c.lastOrderDaysAgo > 45 ? 0.7 : c.lastOrderDaysAgo > 25 ? 0.4 : 0.15,
        consentAt: new Date(now.getTime() - 120 * 86400000),
        consentVersion: '1.0',
        sourceSystem: 'MANUAL',
      },
    });
    customerIds.push(customer.id);

    const nOrders = 2 + Math.floor(Math.random() * 4);
    let spent = 0;
    for (let i = 0; i < nOrders; i++) {
      orderSeq += 1;
      const daysAgo = (c.lastOrderDaysAgo === 0 ? 1 : c.lastOrderDaysAgo) + i * Math.max(c.avgIntervalDays, 12);
      const createdAt = new Date(now.getTime() - daysAgo * 86400000);
      const itemCount = 2 + Math.floor(Math.random() * 4);
      const usedCodes = new Set<string>();
      let total = 0;
      const items: Array<{ productId: string; quantity: number; unitPrice: number }> = [];
      for (let j = 0; j < itemCount; j++) {
        const code = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)].code;
        if (usedCodes.has(code)) continue;
        usedCodes.add(code);
        const qty = 1 + Math.floor(Math.random() * 8);
        const price = PRODUCTS.find((p) => p.code === code)!.price;
        total += price * qty;
        items.push({ productId: productIds.get(code)!, quantity: qty, unitPrice: price });
      }
      spent += total;
      await prisma.order.create({
        data: {
          number: orderSeq,
          customerId: customer.id,
          source: 'MANUAL',
          status: 'FATURADO',
          subtotal: total,
          total,
          paymentTerm: '28 dias',
          createdAt,
          items: {
            create: items.map((it) => ({ ...it, discount: 0, total: it.unitPrice * it.quantity })),
          },
        },
      });
    }
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        totalSpent: spent,
        averageTicket: nOrders ? Math.round((spent / nOrders) * 100) / 100 : 0,
        orderCount: nOrders,
        firstPurchaseAt: new Date(now.getTime() - 120 * 86400000),
        expectedNextPurchaseAt: lastPurchase ? new Date(lastPurchase.getTime() + c.avgIntervalDays * 86400000) : null,
      },
    });
  }

  const someCustomers = customerIds.slice(0, 8);
  const codes = PRODUCTS.map((p) => p.code);
  for (const cid of someCustomers) {
    const code = codes[Math.floor(Math.random() * codes.length)];
    await prisma.customerRecommendation.create({
      data: {
        customerId: cid,
        productId: productIds.get(code)!,
        type: 'REPOSICAO',
        reason: `Top comprado recentemente`,
        confidence: 0.85,
      },
    }).catch(() => undefined);
  }

  await prisma.lostSale.create({
    data: {
      customerId: customerIds[3] ?? undefined,
      reason: 'PRECO',
      value: 480,
      recovered: false,
      description: 'Cotação de desinfetante 5L (60 un) — encontrou preço menor',
    },
  }).catch(() => undefined);

  console.log(`Seed demo concluído: ${productIds.size} produtos, ${customerIds.length} clientes, ${orderSeq} pedidos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());