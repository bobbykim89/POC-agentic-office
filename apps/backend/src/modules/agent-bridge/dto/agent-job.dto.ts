export interface AgentJobDto {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  sourceTransport: 'rest' | 'ws';
  conversationId: string | null;
  messageId: string | null;
  requestPayload: unknown;
  responsePayload: unknown;
  errorCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
