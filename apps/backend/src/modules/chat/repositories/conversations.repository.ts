import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import {
  conversationParticipants,
  conversations,
} from '../../../database/schema/conversations.schema';
import { users } from '../../../database/schema/users.schema';

@Injectable()
export class ConversationsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listForUser(userId: string) {
    const db = this.requireDb();
    return db
      .select({
        id: conversations.id,
        type: conversations.type,
        title: conversations.title,
        roomId: conversations.roomId,
        createdBy: conversations.createdBy,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        and(
          eq(conversationParticipants.conversationId, conversations.id),
          eq(conversationParticipants.userId, userId),
          isNull(conversationParticipants.leftAt),
        ),
      )
      .orderBy(sql`${conversations.lastMessageAt} desc nulls last`, conversations.createdAt);
  }

  async listConversationIdsForUser(userId: string) {
    const db = this.requireDb();
    const rows = await db
      .select({
        id: conversations.id,
      })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        and(
          eq(conversationParticipants.conversationId, conversations.id),
          eq(conversationParticipants.userId, userId),
          isNull(conversationParticipants.leftAt),
        ),
      );

    return rows.map((row) => row.id);
  }

  async findByIdForParticipant(conversationId: string, userId: string) {
    const db = this.requireDb();
    const [conversation] = await db
      .select({
        id: conversations.id,
        type: conversations.type,
        title: conversations.title,
        roomId: conversations.roomId,
        createdBy: conversations.createdBy,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        and(
          eq(conversationParticipants.conversationId, conversations.id),
          eq(conversationParticipants.userId, userId),
          isNull(conversationParticipants.leftAt),
        ),
      )
      .where(eq(conversations.id, conversationId))
      .limit(1);

    return conversation;
  }

  async findDirectConversationBetween(firstUserId: string, secondUserId: string) {
    const db = this.requireDb();
    const participantIds = [firstUserId, secondUserId];

    const [result] = await db
      .select({ conversationId: conversations.id })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        and(
          eq(conversationParticipants.conversationId, conversations.id),
          isNull(conversationParticipants.leftAt),
        ),
      )
      .where(
        and(
          eq(conversations.type, 'direct'),
          inArray(conversationParticipants.userId, participantIds),
        ),
      )
      .groupBy(conversations.id)
      .having(
        sql`count(*) = 2 and count(distinct ${conversationParticipants.userId}) = 2`,
      )
      .limit(1);

    if (!result) {
      return null;
    }

    return this.findById(result.conversationId);
  }

  async findById(conversationId: string) {
    const db = this.requireDb();
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    return conversation;
  }

  async createConversation(input: {
    type: 'direct' | 'group';
    title?: string | null;
    roomId?: string | null;
    createdBy?: string | null;
  }) {
    const db = this.requireDb();
    const [conversation] = await db
      .insert(conversations)
      .values({
        type: input.type,
        title: input.title ?? null,
        roomId: input.roomId ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();

    return conversation;
  }

  async addParticipants(
    conversationId: string,
    participantUserIds: string[],
    createdByUserId?: string,
  ) {
    const db = this.requireDb();
    const uniqueParticipantIds = [...new Set(participantUserIds)];
    if (uniqueParticipantIds.length === 0) {
      return [];
    }

    return db
      .insert(conversationParticipants)
      .values(
        uniqueParticipantIds.map((userId) => ({
          conversationId,
          userId,
          role:
            createdByUserId && userId === createdByUserId
              ? ('owner' as const)
              : ('member' as const),
        })),
      )
      .returning();
  }

  async listParticipants(conversationIds: string[]) {
    const db = this.requireDb();
    if (conversationIds.length === 0) {
      return [];
    }

    return db
      .select({
        conversationId: conversationParticipants.conversationId,
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        spriteSheetUrl: users.spriteSheetUrl,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(
        and(
          inArray(conversationParticipants.conversationId, conversationIds),
          isNull(conversationParticipants.leftAt),
        ),
      );
  }

  async listParticipantUserIds(conversationId: string) {
    const db = this.requireDb();
    const rows = await db
      .select({
        userId: conversationParticipants.userId,
      })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          isNull(conversationParticipants.leftAt),
        ),
      );

    return rows.map((row) => row.userId);
  }

  async touchConversation(conversationId: string, input: { lastMessageAt: Date }) {
    const db = this.requireDb();
    await db
      .update(conversations)
      .set({
        updatedAt: new Date(),
        lastMessageAt: input.lastMessageAt,
      })
      .where(eq(conversations.id, conversationId));
  }

  private requireDb() {
    if (!this.databaseService.db) {
      throw new Error('DATABASE_URL is not configured for chat operations.');
    }

    return this.databaseService.db;
  }
}
