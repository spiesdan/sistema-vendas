import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CrmModule } from './crm/crm.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { SettingsModule } from './settings/settings.module';
import { QueueModule } from './queue/queue.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { N8nModule } from './n8n/n8n.module';
import { AutomationModule } from './automation/automation.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { LeadsModule } from './leads/lead.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { CopilotModule } from './copilot/copilot.module';
import { AlertsModule } from './alerts/alerts.module';
import { PublicModule } from './public/public.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 300,
      },
    ]),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CrmModule,
    DashboardModule,
    IntegrationsModule,
    SettingsModule,
    QueueModule,
    WhatsappModule,
    N8nModule,
    AutomationModule,
    CampaignsModule,
    LeadsModule,
    IntelligenceModule,
    CopilotModule,
    AlertsModule,
    PublicModule,
  ],
})
export class AppModule {}