import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const officeEvents = pgTable('office_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: text('type').notNull(),
  payload: text('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
