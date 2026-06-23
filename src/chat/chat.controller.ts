import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('send')
  async sendMessage(
    @CurrentUser('id') senderId: string,
    @Body() body: { receiverId: string; content: string }
  ) {
    return this.chatService.sendMessage(senderId, body.receiverId, body.content);
  }

  @Get('history/:partnerId')
  async getHistory(
    @CurrentUser('id') userId: string,
    @Param('partnerId') partnerId: string
  ) {
    return this.chatService.getHistory(userId, partnerId);
  }

  @Get('conversations')
  async getConversations(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: Role
  ) {
    return this.chatService.getConversations(userId, role);
  }

  @Post('block')
  async setBlockStatus(
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: Role,
    @Body() body: { employeeId: string; block: boolean }
  ) {
    return this.chatService.setBlockStatus(body.employeeId, body.block, actorId, actorRole);
  }
}
