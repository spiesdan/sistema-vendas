import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { CopilotService } from './copilot.service';
import { CopilotController } from './copilot.controller';

@Module({
  imports: [PrismaModule, IntelligenceModule],
  providers: [CopilotService],
  controllers: [CopilotController],
  exports: [CopilotService],
})
export class CopilotModule {}