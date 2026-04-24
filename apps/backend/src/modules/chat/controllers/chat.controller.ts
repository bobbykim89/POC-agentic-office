import { Body, Controller, Get, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { ApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { toApiSuccessResponse } from '../../../common/interfaces/api-response.interface';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { ChatConversationDto } from '../dto/chat-conversation.dto';
import type { ChatMessageDto } from '../dto/chat-message.dto';
import { GetMessagesQueryDto } from '../dto/get-messages-query.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { ChatService } from '../services/chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async getConversations(
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<ApiSuccessResponse<ChatConversationDto[]>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return toApiSuccessResponse(await this.chatService.getConversations(user.userId));
  }

  @Get('conversations/:conversationId/messages')
  async getMessages(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('conversationId') conversationId: string,
    @Query() query: GetMessagesQueryDto,
  ): Promise<ApiSuccessResponse<ChatMessageDto[]>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    const limit = this.parseLimit(query.limit);
    return toApiSuccessResponse(
      await this.chatService.getMessages(user.userId, conversationId, limit),
    );
  }

  @Post('messages')
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() payload: SendMessageDto,
  ): Promise<ApiSuccessResponse<ChatMessageDto>> {
    if (!user) {
      throw new UnauthorizedException('Authenticated user is required.');
    }

    return toApiSuccessResponse(await this.chatService.sendMessage(user.userId, payload));
  }

  private parseLimit(rawLimit?: string): number {
    const parsedLimit = rawLimit ? Number(rawLimit) : 50;
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      return 50;
    }

    return Math.min(parsedLimit, 100);
  }
}
