import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { rooms } from './rooms.schema';
import { conversationTypeEnum, participantRoleEnum } from './enums.schema';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: conversationTypeEnum('type').notNull(),
    roomId: uuid('room_id').references(() => rooms.id, {
      onDelete: 'set null',
    }),
    title: text('title'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    conversationsTypeLastMessageAtIdx: index('conversations_type_last_message_at_idx').on(
      table.type,
      table.lastMessageAt,
    ),
    conversationsRoomLastMessageAtIdx: index('conversations_room_last_message_at_idx').on(
      table.roomId,
      table.lastMessageAt,
    ),
    conversationsCreatedByIdx: index('conversations_created_by_idx').on(table.createdBy),
  }),
);

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: participantRoleEnum('role').default('member').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => ({
    conversationParticipantsConversationUserUniqueIdx: uniqueIndex(
      'conversation_participants_conversation_user_unique_idx',
    ).on(table.conversationId, table.userId),
    conversationParticipantsUserJoinedAtIdx: index(
      'conversation_participants_user_joined_at_idx',
    ).on(table.userId, table.joinedAt),
    conversationParticipantsConversationJoinedAtIdx: index(
      'conversation_participants_conversation_joined_at_idx',
    ).on(table.conversationId, table.joinedAt),
    conversationParticipantsActiveMembershipIdx: index(
      'conversation_participants_active_membership_idx',
    )
      .on(table.conversationId, table.userId)
      .where(sql`${table.leftAt} is null`),
    conversationParticipantsJoinedLeftCheck: check(
      'conversation_participants_joined_left_check',
      sql`${table.leftAt} is null or ${table.leftAt} >= ${table.joinedAt}`,
    ),
  }),
);
