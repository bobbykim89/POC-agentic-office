import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    username: text('username').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    passwordHash: text('password_hash').notNull(),
    refreshTokenHash: text('refresh_token_hash'),
    spriteSheetUrl: text('sprite_sheet_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    usersUsernameUniqueIdx: uniqueIndex('users_username_unique_idx').on(table.username),
    usersEmailUniqueIdx: uniqueIndex('users_email_unique_idx').on(table.email),
    usersCreatedAtIdx: index('users_created_at_idx').on(table.createdAt),
  }),
);
