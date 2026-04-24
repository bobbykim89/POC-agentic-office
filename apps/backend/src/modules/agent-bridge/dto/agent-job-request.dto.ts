export interface AgentJobRequestDto<TPayload = unknown> {
  type: string;
  upstreamPath: string;
  method: 'GET' | 'POST';
  body?: TPayload;
  query?: Record<string, string | number | boolean | undefined>;
  conversationId?: string | null;
  messageId?: string | null;
}
