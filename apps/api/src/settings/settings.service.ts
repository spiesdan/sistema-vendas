import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  'classify.novo_ultimos_dias': 30,
  'classify.inativo_limite_dias': 45,
  'classify.perdido_limite_dias': 90,
  'classify.vip_faturamento_mensual': 5000,
  'automatizacao.inativo_limite_dias': 20,
  'whatsapp.max_messages_per_customer': 1,
  'whatsapp.interval_min_minutes': 0,
  'whatsapp.working_hours_start': '09:00',
  'whatsapp.working_hours_end': '18:00',
  'whatsapp.working_days': ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  'sale.low_stock_threshold': 5,
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll() {
    const rows = await this.prisma.setting.findMany();
    const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const row of rows) result[row.key] = row.value;
    return result;
  }

  async get(key: string) {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return row?.value ?? DEFAULT_SETTINGS[key];
  }

  async set(key: string, value: unknown, updatedBy?: string) {
    return this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as object, updatedBy },
      update: { value: value as object, updatedBy },
    });
  }
}