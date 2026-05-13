import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export type AssistantNotificationSuggestedAction = {
  type: 'open_weekly_report' | 'open_news' | 'open_email_summary' | 'open_task_hint';
  label: string;
} | null;

export const assistantNotifications = pgTable(
  'assistant_notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    priority: text('priority').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    suggestedAction: jsonb('suggested_action')
      .$type<AssistantNotificationSuggestedAction>()
      .default(sql`null`),
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    assistantNotificationsUserCreatedAtIdx: index(
      'assistant_notifications_user_created_at_idx',
    ).on(table.userId, table.createdAt),
    assistantNotificationsUserKindCreatedAtIdx: index(
      'assistant_notifications_user_kind_created_at_idx',
    ).on(table.userId, table.kind, table.createdAt),
    assistantNotificationsUserDedupeKeyIdx: index(
      'assistant_notifications_user_dedupe_key_idx',
    ).on(table.userId, table.dedupeKey),
  }),
);
