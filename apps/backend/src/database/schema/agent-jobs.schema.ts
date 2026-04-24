import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { conversations } from './conversations.schema';
import { agentJobSourceTransportEnum, agentJobStatusEnum } from './enums.schema';
import { messages } from './messages.schema';
import { users } from './users.schema';

export const agentJobs = pgTable(
  'agent_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    messageId: uuid('message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(),
    status: agentJobStatusEnum('status').notNull().default('pending'),
    sourceTransport: agentJobSourceTransportEnum('source_transport').notNull(),
    requestPayload: jsonb('request_payload'),
    responsePayload: jsonb('response_payload'),
    errorCode: text('error_code'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    agentJobsUserCreatedAtIdx: index('agent_jobs_user_created_at_idx').on(
      table.userId,
      table.createdAt,
    ),
    agentJobsStatusCreatedAtIdx: index('agent_jobs_status_created_at_idx').on(
      table.status,
      table.createdAt,
    ),
    agentJobsConversationCreatedAtIdx: index('agent_jobs_conversation_created_at_idx').on(
      table.conversationId,
      table.createdAt,
    ),
  }),
);
