import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { N8nService, N8nWebhookEvent } from './n8n.service';
import { N8nWorkflowTrigger } from './n8n.client';

@Controller('n8n')
@UseGuards(AuthGuard('jwt'))
export class N8nController {
  constructor(private readonly n8n: N8nService) {}

  @Get('status')
  @Roles('ADMIN', 'GESTOR')
  status() {
    return this.n8n.status();
  }

  @Post('workflow/:id/trigger')
  @Roles('ADMIN', 'GESTOR')
  trigger(@Param('id') id: string, @Body() body: { payload?: Record<string, unknown> }) {
    return this.n8n.trigger({ workflowId: id, payload: body.payload });
  }

  @Get('executions/:id')
  @Roles('ADMIN', 'GESTOR')
  getExecution(@Param('id') id: string) {
    return this.n8n.getExecution(id);
  }

  @Post('executions/:id/retry')
  @Roles('ADMIN', 'GESTOR')
  retryExecution(@Param('id') id: string) {
    return this.n8n.retryExecution(id);
  }

  @Post('retry-failed')
  @Roles('ADMIN', 'GESTOR')
  retryFailed() {
    return this.n8n.retryFailedExecutions();
  }
}

@Controller('webhooks/n8n')
export class N8nWebhookController {
  constructor(private readonly n8n: N8nService) {}

  @Post('events')
  handle(
    @Body() body: N8nWebhookEvent,
    @Req() req: Request & { rawBody?: string },
    @Headers('x-n8n-signature') signature?: string,
    @Headers('x-n8n-timestamp') timestamp?: string,
  ) {
    return this.n8n.handleWebhook(body, req.rawBody, signature, timestamp);
  }

  @Get('ping')
  ping() {
    return { ok: true, message: 'Webhook de n8n ativo' };
  }
}