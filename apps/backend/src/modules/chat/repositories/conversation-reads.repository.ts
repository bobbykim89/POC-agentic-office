import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import { conversationReads } from '../../../database/schema/conversation-reads.schema';

@Injectable()
export class ConversationReadsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByConversationAndUser(conversationId: string, userId: string) {
    const db = this.requireDb();
    const [readState] = await db
      .select()
      .from(conversationReads)
      .where(
        and(
          eq(conversationReads.conversationId, conversationId),
          eq(conversationReads.userId, userId),
        ),
      )
      .limit(1);

    return readState;
  }

  async upsertReadState(input: {
    conversationId: string;
    userId: string;
    lastReadMessageId: string;
    lastReadAt: Date;
  }) {
    const db = this.requireDb();
    await db
      .insert(conversationReads)
      .values({
        conversationId: input.conversationId,
        userId: input.userId,
        lastReadMessageId: input.lastReadMessageId,
        lastReadAt: input.lastReadAt,
      })
      .onConflictDoUpdate({
        target: [
          conversationReads.conversationId,
          conversationReads.userId,
        ],
        set: {
          lastReadMessageId: input.lastReadMessageId,
          lastReadAt: input.lastReadAt,
          updatedAt: new Date(),
        },
      });
  }

  private requireDb() {
    if (!this.databaseService.db) {
      throw new Error('DATABASE_URL is not configured for chat operations.');
    }

    return this.databaseService.db;
  }
}
