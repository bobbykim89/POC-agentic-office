import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import { messages } from '../../../database/schema/messages.schema';
import { users } from '../../../database/schema/users.schema';

@Injectable()
export class MessagesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listForConversation(conversationId: string, limit: number) {
    const db = this.requireDb();
    const rows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        senderUsername: users.username,
        senderDisplayName: users.displayName,
        senderSpriteSheetUrl: users.spriteSheetUrl,
        content: messages.content,
        messageType: messages.messageType,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(
        and(
          eq(messages.conversationId, conversationId),
          isNull(messages.deletedAt),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return rows.reverse();
  }

  async listLatestForConversations(conversationIds: string[]) {
    const db = this.requireDb();
    if (conversationIds.length === 0) {
      return [];
    }

    return db
      .selectDistinctOn([messages.conversationId], {
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        senderUsername: users.username,
        senderDisplayName: users.displayName,
        senderSpriteSheetUrl: users.spriteSheetUrl,
        content: messages.content,
        messageType: messages.messageType,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(
        and(
          inArray(messages.conversationId, conversationIds),
          isNull(messages.deletedAt),
        ),
      )
      .orderBy(messages.conversationId, desc(messages.createdAt));
  }

  async getLatestVisibleMessage(conversationId: string) {
    const db = this.requireDb();
    const [message] = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        senderUsername: users.username,
        senderDisplayName: users.displayName,
        senderSpriteSheetUrl: users.spriteSheetUrl,
        content: messages.content,
        messageType: messages.messageType,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(
        and(
          eq(messages.conversationId, conversationId),
          isNull(messages.deletedAt),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);

    return message ?? null;
  }

  async createMessage(input: {
    conversationId: string;
    senderId: string;
    content: string;
    messageType: 'text' | 'system' | 'agent';
  }) {
    const db = this.requireDb();
    const [message] = await db
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        senderId: input.senderId,
        content: input.content,
        messageType: input.messageType,
      })
      .returning();

    return message;
  }

  async countUnreadMessages(input: {
    conversationId: string;
    userId: string;
    lastReadAt?: Date | null;
  }) {
    const db = this.requireDb();
    const rows = await db
      .select({
        id: messages.id,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, input.conversationId),
          isNull(messages.deletedAt),
          ne(messages.senderId, input.userId),
        ),
      );

    return rows.filter((row) => {
      if (!input.lastReadAt) {
        return true;
      }

      return row.createdAt > input.lastReadAt;
    }).length;
  }

  private requireDb() {
    if (!this.databaseService.db) {
      throw new Error('DATABASE_URL is not configured for chat operations.');
    }

    return this.databaseService.db;
  }
}
