import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { roomTypeEnum } from './enums.schema';

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    type: roomTypeEnum('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    roomsTypeCreatedAtIdx: index('rooms_type_created_at_idx').on(table.type, table.createdAt),
  }),
);
