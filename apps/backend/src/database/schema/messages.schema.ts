import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { conversations } from './conversations.schema';
import { messageTypeEnum } from './enums.schema';
import { users } from './users.schema';

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    messageType: messageTypeEnum('message_type').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    messagesConversationCreatedAtIdx: index('messages_conversation_created_at_idx').on(
      table.conversationId,
      table.createdAt,
    ),
    messagesSenderCreatedAtIdx: index('messages_sender_created_at_idx').on(
      table.senderId,
      table.createdAt,
    ),
    messagesConversationVisibleCreatedAtIdx: index(
      'messages_conversation_visible_created_at_idx',
    )
      .on(table.conversationId, table.createdAt)
      .where(sql`${table.deletedAt} is null`),
  }),
);
