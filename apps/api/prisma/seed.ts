import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/auth.service';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('Seed iniciado');

  // Usuário admin inicial (a partir de env, seguras de não sobrescribir)
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@empresa.com.br';
  const adminPassword = process.env.ADMIN_PASSWORD || 'mudar123';

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: process.env.ADMIN_NAME || 'Administrador',
        email: adminEmail,
        passwordHash: hashPassword(adminPassword),
        role: 'ADMIN',
      },
    });
    console.log('Usuario admin criado:', adminEmail);
  } else {
    console.log('Usuario admin já existe.');
  }

  // Região e cidade inicial (Canoinhas / Santa Catarina)
  const region = await prisma.region.upsert({
    where: { code: 'NORTE_SC' },
    create: { name: 'Norte SC', code: 'NORTE_SC' },
    update: {},
  });
  await prisma.city.upsert({
    where: { name_state: { name: 'Canoinhas', state: 'SC' } },
    create: { name: 'Canoinhas', state: 'SC', regionId: region.id },
    update: {},
  });
  console.log('Região Norte SC / cidade Canoinhas prontas.');

  // Registra integraciones em estado disconnected (padron)
  await prisma.integration.upsert({
    where: { provider_name: { provider: 'ODVIX', name: 'ODVIX' } },
    create: {
      provider: 'ODVIX',
      name: 'ODVIX',
      enabled: false,
      status: 'DISCONNECTED',
      config: { paths: {} },
    },
    update: {},
  });
  await prisma.integration.upsert({
    where: { provider_name: { provider: 'MERCOS', name: 'MERCOS' } },
    create: {
      provider: 'MERCOS',
      name: 'MERCOS',
      enabled: false,
      status: 'DISCONNECTED',
      config: {},
    },
    update: {},
  });
  console.log('Integraciones registradas.');

  console.log('Seed concluído.');
}

main()
  .catch((err) => {
    console.error('Erro no seed', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());