import { index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { presenceStatusEnum } from './enums.schema';
import { rooms } from './rooms.schema';
import { users } from './users.schema';

export const presence = pgTable(
  'presence',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: presenceStatusEnum('status').notNull().default('offline'),
    socketCount: integer('socket_count').notNull().default(0),
    currentRoomId: uuid('current_room_id').references(() => rooms.id, {
      onDelete: 'set null',
    }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    presenceStatusUpdatedAtIdx: index('presence_status_updated_at_idx').on(
      table.status,
      table.updatedAt,
    ),
    presenceCurrentRoomStatusIdx: index('presence_current_room_status_idx').on(
      table.currentRoomId,
      table.status,
    ),
  }),
);
