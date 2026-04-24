import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { rooms } from './rooms.schema';
import { users } from './users.schema';

export const coordinates = pgTable(
  'coordinates',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id').references(() => rooms.id, {
      onDelete: 'set null',
    }),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    coordinatesRoomUpdatedAtIdx: index('coordinates_room_updated_at_idx').on(
      table.roomId,
      table.updatedAt,
    ),
    coordinatesXNonNegativeCheck: check('coordinates_x_non_negative_check', sql`${table.x} >= 0`),
    coordinatesYNonNegativeCheck: check('coordinates_y_non_negative_check', sql`${table.y} >= 0`),
  }),
);
