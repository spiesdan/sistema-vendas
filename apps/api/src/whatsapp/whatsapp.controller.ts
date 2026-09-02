import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WhatsappService, ConversationListQuery } from './whatsapp.service';
import { ChatbotService } from './chatbot.service';
import { WhatsappWebhookEvent } from './whatsapp.client';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('whatsapp')
@UseGuards(AuthGuard('jwt'))
export class WhatsappController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly chatbot: ChatbotService,
  ) {}

  @Get('conversations')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE', 'MARKETING', 'SUPORTE')
  list(@Query() query: ConversationListQuery) {
    return this.whatsapp.list(query);
  }

  @Get('conversations/:id')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE', 'MARKETING', 'SUPORTE')
  detail(@Param('id') id: string) {
    return this.whatsapp.findById(id);
  }

  @Post('conversations/:id/messages')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE', 'MARKETING', 'SUPORTE')
  sendMessage(@Param('id') id: string, @Body() body: { to: string; text: string }) {
    return this.whatsapp.sendMessage({ conversationId: id, to: body.to, text: body.text });
  }

  @Post('conversations/:id/assign')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE', 'SUPORTE')
  assign(@Param('id') id: string, @Body() body: { userId: string }) {
    return this.whatsapp.assign(id, body.userId);
  }

  @Post('conversations/:id/handoff')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE', 'SUPORTE')
  handoff(@Param('id') id: string) {
    return this.whatsapp.handoff(id);
  }

  @Get('conversations/:id/handoff-context')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'ATENDENTE', 'SUPORTE')
  handoffContext(@Param('id') id: string) {
    return this.whatsapp.handoffContextForConversation(id);
  }

  @Patch('conversations/:id/close')
  @Roles('ADMIN', 'GESTOR', 'ATENDENTE')
  close(@Param('id') id: string) {
    return this.whatsapp.close(id);
  }

  @Patch('conversations/:id/reopen')
  @Roles('ADMIN', 'GESTOR', 'ATENDENTE')
  reopen(@Param('id') id: string) {
    return this.whatsapp.reopen(id);
  }

  @Post('conversations/:id/suggest')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'MARKETING')
  async suggest(@Param('id') id: string, @Body() body: { take?: number }) {
    const conv = await this.whatsapp.findById(id);
    if (!conv.customerId) return { count: 0 };
    const count = await this.chatbot.suggestProducts(conv.customerId, body.take ?? 3);
    return { count };
  }
}

@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Post()
  handle(@Body() body: WhatsappWebhookEvent) {
    return this.whatsapp.handleWebhook(body);
  }

  @Get('ping')
  ping() {
    return { ok: true, message: 'Webhook de WhatsApp activo' };
  }
}