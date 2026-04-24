export interface RealtimeChatSendDto {
  requestId?: string;
  conversationId?: string;
  directRecipientUserId?: string;
  content: string;
  messageType?: 'text' | 'system' | 'agent';
}
