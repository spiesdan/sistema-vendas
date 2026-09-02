import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const DEFAULT_SOURCE_CONFIG = {
  PRODUTO: 'ODVIX',
  PEDIDO: 'ODVIX',
  CLIENTE: 'ODVIX',
  REPRESENTANTE: 'MERCOS',
  PRECO: 'ODVIX',
  ESTOQUE: 'ODVIX',
} as const;

/**
 * Registry de integrações: controla qual sistema é a fonte principal
 * de cada informação (configurável via tabela Setting).
 */
@Injectable()
export class IntegrationRegistryService {
  private readonly logger = new Logger(IntegrationRegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSourceFor(entity: keyof typeof DEFAULT_SOURCE_CONFIG): Promise<string> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: `source.${entity}` },
    });
    const stored = setting?.value as { value?: string } | null;
    return stored?.value ?? DEFAULT_SOURCE_CONFIG[entity] ?? 'ODVIX';
  }

  async listSources() {
    const keys = Object.keys(DEFAULT_SOURCE_CONFIG);
    const result: Record<string, string> = {};
    for (const key of keys) {
      result[key] = await this.getSourceFor(key as keyof typeof DEFAULT_SOURCE_CONFIG);
    }
    return result;
  }

  async setSource(entity: string, provider: string) {
    await this.prisma.setting.upsert({
      where: { key: `source.${entity}` },
      create: { key: `source.${entity}`, value: { value: provider } },
      update: { value: { value: provider } },
    });
    this.logger.log(`Fonte de ${entity} definida como ${provider}`);
    return this.listSources();
  }

  /** Regra de conflito: sistema vencedor tem prioridade na atualização local. */
  shouldApplyUpdate(current: { sourceSystem?: string | null }, incoming: string): boolean {
    if (!current?.sourceSystem) return true;
    return current.sourceSystem === incoming;
  }
}