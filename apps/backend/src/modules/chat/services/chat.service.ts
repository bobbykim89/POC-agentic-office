import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from '../../users/repositories/users.repository';
import type { ChatConversationDto } from '../dto/chat-conversation.dto';
import type { ChatMessageDto } from '../dto/chat-message.dto';
import type { ChatUserDto } from '../dto/chat-user.dto';
import { ConversationReadsRepository } from '../repositories/conversation-reads.repository';
import { ConversationsRepository } from '../repositories/conversations.repository';
import { MessagesRepository } from '../repositories/messages.repository';
import type { SendMessageDto } from '../dto/send-message.dto';

export interface RealtimeChatSendResult {
  message: ChatMessageDto;
  participantUserIds: string[];
}

@Injectable()
export class ChatService {
  constructor(
    private readonly conversationsRepository: ConversationsRepository,
    private readonly messagesRepository: MessagesRepository,
    private readonly conversationReadsRepository: ConversationReadsRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  async getConversations(userId: string): Promise<ChatConversationDto[]> {
    const conversations = await this.conversationsRepository.listForUser(userId);
    const conversationIds = conversations.map((conversation) => conversation.id);
    const [participants, latestMessages] = await Promise.all([
      this.conversationsRepository.listParticipants(conversationIds),
      this.messagesRepository.listLatestForConversations(conversationIds),
    ]);

    const participantsByConversationId = new Map<string, ChatUserDto[]>();
    for (const participant of participants) {
      const bucket = participantsByConversationId.get(participant.conversationId) ?? [];
      bucket.push({
        id: participant.userId,
        username: participant.username,
        displayName: participant.displayName ?? null,
        spriteSheetUrl: participant.spriteSheetUrl ?? null,
      });
      participantsByConversationId.set(participant.conversationId, bucket);
    }

    const latestMessageByConversationId = new Map(
      latestMessages.map((message) => [message.conversationId, this.toMessageDto(message)]),
    );

    return Promise.all(
      conversations.map(async (conversation) => {
        const readState = await this.conversationReadsRepository.findByConversationAndUser(
          conversation.id,
          userId,
        );
        const unreadCount = await this.messagesRepository.countUnreadMessages({
          conversationId: conversation.id,
          userId,
          lastReadAt: readState?.lastReadAt ?? null,
        });

        return {
          id: conversation.id,
          type: conversation.type,
          title: conversation.title ?? null,
          roomId: conversation.roomId ?? null,
          createdBy: conversation.createdBy ?? null,
          createdAt: conversation.createdAt.toISOString(),
          updatedAt: conversation.updatedAt.toISOString(),
          lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
          participants: participantsByConversationId.get(conversation.id) ?? [],
          latestMessage: latestMessageByConversationId.get(conversation.id) ?? null,
          unreadCount,
        };
      }),
    );
  }

  async getConversationIdsForUser(userId: string): Promise<string[]> {
    return this.conversationsRepository.listConversationIdsForUser(userId);
  }

  async getMessages(
    userId: string,
    conversationId: string,
    limit: number,
  ): Promise<ChatMessageDto[]> {
    await this.requireParticipant(conversationId, userId);

    const messages = await this.messagesRepository.listForConversation(conversationId, limit);
    const latestMessage = messages[messages.length - 1];

    if (latestMessage) {
      await this.conversationReadsRepository.upsertReadState({
        conversationId,
        userId,
        lastReadMessageId: latestMessage.id,
        lastReadAt: new Date(latestMessage.createdAt),
      });
    }

    return messages.map((message) => this.toMessageDto(message));
  }

  async sendMessage(userId: string, payload: SendMessageDto): Promise<ChatMessageDto> {
    const result = await this.sendMessageForRealtime(userId, payload);
    return result.message;
  }

  async sendMessageForRealtime(
    userId: string,
    payload: SendMessageDto,
  ): Promise<RealtimeChatSendResult> {
    const normalizedContent = payload.content?.trim();
    if (!normalizedContent) {
      throw new BadRequestException('Message content is required.');
    }

    const conversationId = payload.conversationId
      ? await this.resolveExistingConversationId(payload.conversationId, userId)
      : await this.resolveDirectConversationId(userId, payload.directRecipientUserId);

    const message = await this.messagesRepository.createMessage({
      conversationId,
      senderId: userId,
      content: normalizedContent,
      messageType: payload.messageType ?? 'text',
    });

    await Promise.all([
      this.conversationsRepository.touchConversation(conversationId, {
        lastMessageAt: message.createdAt,
      }),
      this.conversationReadsRepository.upsertReadState({
        conversationId,
        userId,
        lastReadMessageId: message.id,
        lastReadAt: message.createdAt,
      }),
    ]);

    const latestMessage = await this.messagesRepository.getLatestVisibleMessage(conversationId);
    if (!latestMessage) {
      throw new NotFoundException('The saved message could not be loaded.');
    }

    return {
      message: this.toMessageDto(latestMessage),
      participantUserIds: await this.conversationsRepository.listParticipantUserIds(
        conversationId,
      ),
    };
  }

  async getOrCreateDirectConversation(userId: string, otherUserId: string) {
    return this.resolveDirectConversationId(userId, otherUserId);
  }

  async createGroupConversation(input: {
    createdBy: string;
    title: string;
    participantUserIds: string[];
    roomId?: string | null;
  }) {
    const uniqueParticipantIds = [...new Set([input.createdBy, ...input.participantUserIds])];
    if (uniqueParticipantIds.length < 2) {
      throw new BadRequestException('Group conversations require at least two participants.');
    }

    const conversation = await this.conversationsRepository.createConversation({
      type: 'group',
      title: input.title.trim(),
      roomId: input.roomId ?? null,
      createdBy: input.createdBy,
    });

    await this.conversationsRepository.addParticipants(
      conversation.id,
      uniqueParticipantIds,
      input.createdBy,
    );

    return conversation.id;
  }

  private async resolveExistingConversationId(conversationId: string, userId: string) {
    const conversation = await this.requireParticipant(conversationId, userId);
    return conversation.id;
  }

  private async resolveDirectConversationId(userId: string, directRecipientUserId?: string) {
    const recipientUserId = directRecipientUserId?.trim();
    if (!recipientUserId) {
      throw new BadRequestException(
        'Provide either conversationId or directRecipientUserId.',
      );
    }

    if (recipientUserId === userId) {
      throw new BadRequestException('You cannot create a direct conversation with yourself.');
    }

    const recipient = await this.usersRepository.findById(recipientUserId);
    if (!recipient) {
      throw new NotFoundException('Direct message recipient was not found.');
    }

    const existingConversation = await this.conversationsRepository.findDirectConversationBetween(
      userId,
      recipientUserId,
    );
    if (existingConversation) {
      return existingConversation.id;
    }

    const conversation = await this.conversationsRepository.createConversation({
      type: 'direct',
      createdBy: userId,
    });
    await this.conversationsRepository.addParticipants(conversation.id, [userId, recipientUserId], userId);
    return conversation.id;
  }

  private async requireParticipant(conversationId: string, userId: string) {
    const conversation = await this.conversationsRepository.findByIdForParticipant(
      conversationId,
      userId,
    );

    if (!conversation) {
      throw new ForbiddenException('You do not have access to this conversation.');
    }

    return conversation;
  }

  private toMessageDto(message: {
    id: string;
    conversationId: string;
    senderId: string | null;
    senderUsername: string | null;
    senderDisplayName: string | null;
    senderSpriteSheetUrl: string | null;
    content: string;
    messageType: 'text' | 'system' | 'agent';
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): ChatMessageDto {
    return {
      id: message.id,
      conversationId: message.conversationId,
      sender: message.senderId
        ? {
            id: message.senderId,
            username: message.senderUsername ?? 'unknown',
            displayName: message.senderDisplayName ?? null,
            spriteSheetUrl: message.senderSpriteSheetUrl ?? null,
          }
        : null,
      content: message.content,
      messageType: message.messageType,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
      deletedAt: message.deletedAt?.toISOString() ?? null,
    };
  }
}
