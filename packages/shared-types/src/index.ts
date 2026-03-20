export interface ApiEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: string;
  payload: TPayload;
  createdAt: string;
}

export interface HealthStatusDto {
  status: 'ok' | 'degraded' | 'down';
  service: 'backend' | 'client' | 'ai-service';
  timestamp: string;
}

export interface DatabaseStatusDto {
  connected: boolean;
  dialect: 'postgresql';
  drizzle: true;
  urlConfigured: boolean;
}

export interface PromptDto {
  prompt: string;
}

export interface ChatSendDto {
  message: string;
}

export interface ChatMessagePayload {
  sender: 'system' | 'user' | 'assistant';
  message: string;
  clientId?: string;
}

export interface RealtimeEnvelope<TPayload = Record<string, unknown>> {
  channel: string;
  event: ApiEvent<TPayload>;
}
