import { pgEnum } from 'drizzle-orm/pg-core';

export const roomTypeEnum = pgEnum('room_type', ['office', 'meeting']);
export const conversationTypeEnum = pgEnum('conversation_type', ['direct', 'group']);
export const participantRoleEnum = pgEnum('participant_role', ['member', 'owner']);
export const messageTypeEnum = pgEnum('message_type', ['text', 'system', 'agent']);
export const presenceStatusEnum = pgEnum('presence_status', ['online', 'offline']);
export const agentJobStatusEnum = pgEnum('agent_job_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);
export const agentJobSourceTransportEnum = pgEnum('agent_job_source_transport', [
  'rest',
  'ws',
]);
export const logScopeEnum = pgEnum('log_scope', ['agent', 'audit', 'system']);
