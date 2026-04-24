import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const externalAccounts = pgTable(
  'external_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id'),
    providerAccountEmail: text('provider_account_email').notNull(),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    scopes: jsonb('scopes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    externalAccountsUserProviderIdx: index('external_accounts_user_provider_idx').on(
      table.userId,
      table.provider,
    ),
    externalAccountsProviderEmailIdx: index('external_accounts_provider_email_idx').on(
      table.provider,
      table.providerAccountEmail,
    ),
    externalAccountsUserProviderEmailUniqueIdx: uniqueIndex(
      'external_accounts_user_provider_email_unique_idx',
    ).on(table.provider, table.userId, table.providerAccountEmail),
  }),
);
