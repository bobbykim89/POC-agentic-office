import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../database/database.service';
import {
  assistantNotifications,
  type AssistantNotificationSuggestedAction,
} from '../../../database/schema/assistant-notifications.schema';

@Injectable()
export class AssistantNotificationsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findByUserAndDedupeKey(userId: string, dedupeKey: string) {
    const db = this.requireDb();
    const [record] = await db
      .select()
      .from(assistantNotifications)
      .where(
        and(
          eq(assistantNotifications.userId, userId),
          eq(assistantNotifications.dedupeKey, dedupeKey),
        ),
      )
      .limit(1);

    return record ?? null;
  }

  async create(input: {
    userId: string;
    kind: string;
    priority: string;
    title: string;
    body: string;
    suggestedAction: AssistantNotificationSuggestedAction;
    dedupeKey: string;
  }) {
    const db = this.requireDb();
    const [record] = await db
      .insert(assistantNotifications)
      .values({
        userId: input.userId,
        kind: input.kind,
        priority: input.priority,
        title: input.title,
        body: input.body,
        suggestedAction: input.suggestedAction,
        dedupeKey: input.dedupeKey,
      })
      .returning();

    return record;
  }

  async findLatestForUser(userId: string) {
    const db = this.requireDb();
    const [record] = await db
      .select()
      .from(assistantNotifications)
      .where(eq(assistantNotifications.userId, userId))
      .orderBy(desc(assistantNotifications.createdAt))
      .limit(1);

    return record ?? null;
  }

  private requireDb() {
    if (!this.databaseService.db) {
      throw new Error('DATABASE_URL is not configured for avatar assistant operations.');
    }

    return this.databaseService.db;
  }
}
