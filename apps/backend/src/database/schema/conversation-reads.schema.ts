import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { conversations } from './conversations.schema';
import { messages } from './messages.schema';
import { users } from './users.schema';

export const conversationReads = pgTable(
  'conversation_reads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadMessageId: uuid('last_read_message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    conversationReadsConversationUserUniqueIdx: uniqueIndex(
      'conversation_reads_conversation_user_unique_idx',
    ).on(table.conversationId, table.userId),
    conversationReadsUserUpdatedAtIdx: index('conversation_reads_user_updated_at_idx').on(
      table.userId,
      table.updatedAt,
    ),
  }),
);
