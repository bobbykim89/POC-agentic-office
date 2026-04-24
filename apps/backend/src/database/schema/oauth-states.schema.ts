import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const oauthStates = pgTable(
  'oauth_states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    state: text('state').notNull(),
    redirectTo: text('redirect_to'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    oauthStatesStateUniqueIdx: uniqueIndex('oauth_states_state_unique_idx').on(table.state),
    oauthStatesProviderUserIdx: index('oauth_states_provider_user_idx').on(
      table.provider,
      table.userId,
    ),
    oauthStatesExpiresAtIdx: index('oauth_states_expires_at_idx').on(table.expiresAt),
  }),
);
