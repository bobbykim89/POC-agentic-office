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

export interface AINewsDto {
  title: string;
  source: string;
  published_at: string;
  article_url: string;
  paragraph: string;
  model: string;
}

export interface LinkedInPostRequestDto {
  text: string;
}

export interface LinkedInPostDto {
  post: string;
  source_text: string;
  tone: string;
  model: string;
}

export interface WeeklyReportMessageDto {
  message_id: string;
  thread_id: string | null;
  subject: string;
  sent_at: string | null;
  to: string[];
  cc: string[];
  snippet: string;
  body_text: string;
  body_html: string;
}

export interface WeeklyReportDraftRequestDto {
  account_email: string;
  weekly_summary: string;
  query?: string;
  max_examples?: number;
  recipient_override?: string | null;
  subject_override?: string | null;
}

export interface WeeklyReportDraftDto {
  account_email: string;
  recipient: string;
  subject: string;
  body: string;
  body_html: string;
  model: string;
  source_examples: WeeklyReportMessageDto[];
  last_week_email: WeeklyReportMessageDto | null;
}

export interface WeeklyReportHistoryDto {
  account_email: string;
  query: string;
  emails: WeeklyReportMessageDto[];
  last_week_email: WeeklyReportMessageDto | null;
}

export interface ConnectedMicrosoftAccountDto {
  account_email: string;
  connected_at: string | null;
  scopes: string[];
}

export interface WeeklyReportReviseRequestDto {
  account_email: string;
  current_subject: string;
  current_body: string;
  current_body_html?: string | null;
  revision_instructions: string;
  recipient?: string | null;
}

export interface WeeklyReportSendRequestDto {
  account_email: string;
  recipient: string;
  subject: string;
  body: string;
  body_html?: string | null;
  confirm_send: boolean;
}

export interface WeeklyReportSendDto {
  account_email: string;
  recipient: string;
  subject: string;
  graph_message_id: string | null;
  graph_conversation_id: string | null;
}

export interface WeeklyReportSaveDraftRequestDto {
  account_email: string;
  recipient: string;
  subject: string;
  body: string;
  body_html?: string | null;
}

export interface WeeklyReportSaveDraftDto {
  account_email: string;
  recipient: string;
  subject: string;
  graph_message_id: string;
  graph_conversation_id: string | null;
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
