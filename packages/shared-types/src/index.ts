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

export interface PromptDto {
  prompt: string;
}
