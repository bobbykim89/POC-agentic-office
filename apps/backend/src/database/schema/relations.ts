import { relations } from 'drizzle-orm';
import { assistantNotifications } from './assistant-notifications.schema';
import { agentJobs } from './agent-jobs.schema';
import { conversationReads } from './conversation-reads.schema';
import { conversationParticipants, conversations } from './conversations.schema';
import { coordinates } from './coordinates.schema';
import { externalAccounts } from './external-accounts.schema';
import { logs } from './logs.schema';
import { messages } from './messages.schema';
import { oauthStates } from './oauth-states.schema';
import { presence } from './presence.schema';
import { rooms } from './rooms.schema';
import { users } from './users.schema';

export const usersRelations = relations(users, ({ many, one }) => ({
  conversationsCreated: many(conversations),
  conversationParticipants: many(conversationParticipants),
  messages: many(messages),
  conversationReads: many(conversationReads),
  presence: one(presence, {
    fields: [users.id],
    references: [presence.userId],
  }),
  coordinates: one(coordinates, {
    fields: [users.id],
    references: [coordinates.userId],
  }),
  externalAccounts: many(externalAccounts),
  oauthStates: many(oauthStates),
  agentJobs: many(agentJobs),
  assistantNotifications: many(assistantNotifications),
  logs: many(logs),
}));

export const assistantNotificationsRelations = relations(
  assistantNotifications,
  ({ one }) => ({
    user: one(users, {
      fields: [assistantNotifications.userId],
      references: [users.id],
    }),
  }),
);

export const externalAccountsRelations = relations(externalAccounts, ({ one }) => ({
  user: one(users, {
    fields: [externalAccounts.userId],
    references: [users.id],
  }),
}));

export const oauthStatesRelations = relations(oauthStates, ({ one }) => ({
  user: one(users, {
    fields: [oauthStates.userId],
    references: [users.id],
  }),
}));

export const roomsRelations = relations(rooms, ({ many }) => ({
  conversations: many(conversations),
  presence: many(presence),
  coordinates: many(coordinates),
}));

export const conversationsRelations = relations(conversations, ({ many, one }) => ({
  room: one(rooms, {
    fields: [conversations.roomId],
    references: [rooms.id],
  }),
  createdByUser: one(users, {
    fields: [conversations.createdBy],
    references: [users.id],
  }),
  participants: many(conversationParticipants),
  messages: many(messages),
  reads: many(conversationReads),
  agentJobs: many(agentJobs),
}));

export const conversationParticipantsRelations = relations(
  conversationParticipants,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationParticipants.conversationId],
      references: [conversations.id],
    }),
    user: one(users, {
      fields: [conversationParticipants.userId],
      references: [users.id],
    }),
  }),
);

export const messagesRelations = relations(messages, ({ many, one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  readReceipts: many(conversationReads),
  agentJobs: many(agentJobs),
}));

export const conversationReadsRelations = relations(conversationReads, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationReads.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [conversationReads.userId],
    references: [users.id],
  }),
  lastReadMessage: one(messages, {
    fields: [conversationReads.lastReadMessageId],
    references: [messages.id],
  }),
}));

export const presenceRelations = relations(presence, ({ one }) => ({
  user: one(users, {
    fields: [presence.userId],
    references: [users.id],
  }),
  currentRoom: one(rooms, {
    fields: [presence.currentRoomId],
    references: [rooms.id],
  }),
}));

export const coordinatesRelations = relations(coordinates, ({ one }) => ({
  user: one(users, {
    fields: [coordinates.userId],
    references: [users.id],
  }),
  room: one(rooms, {
    fields: [coordinates.roomId],
    references: [rooms.id],
  }),
}));

export const agentJobsRelations = relations(agentJobs, ({ many, one }) => ({
  user: one(users, {
    fields: [agentJobs.userId],
    references: [users.id],
  }),
  conversation: one(conversations, {
    fields: [agentJobs.conversationId],
    references: [conversations.id],
  }),
  message: one(messages, {
    fields: [agentJobs.messageId],
    references: [messages.id],
  }),
  logs: many(logs),
}));

export const logsRelations = relations(logs, ({ one }) => ({
  user: one(users, {
    fields: [logs.userId],
    references: [users.id],
  }),
  agentJob: one(agentJobs, {
    fields: [logs.agentJobId],
    references: [agentJobs.id],
  }),
}));
