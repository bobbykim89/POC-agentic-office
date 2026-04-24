import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agentJobs } from './agent-jobs.schema';
import { logScopeEnum } from './enums.schema';
import { users } from './users.schema';

export const logs = pgTable(
  'logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    agentJobId: uuid('agent_job_id').references(() => agentJobs.id, {
      onDelete: 'cascade',
    }),
    scope: logScopeEnum('scope').notNull(),
    eventType: text('event_type').notNull(),
    requestPayload: jsonb('request_payload'),
    responsePayload: jsonb('response_payload'),
    errorCode: text('error_code'),
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    logsAgentJobCreatedAtIdx: index('logs_agent_job_created_at_idx').on(
      table.agentJobId,
      table.createdAt,
    ),
    logsScopeCreatedAtIdx: index('logs_scope_created_at_idx').on(table.scope, table.createdAt),
    logsUserCreatedAtIdx: index('logs_user_created_at_idx').on(table.userId, table.createdAt),
  }),
);
