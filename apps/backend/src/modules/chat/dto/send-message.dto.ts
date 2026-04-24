export class SendMessageDto {
  conversationId?: string;
  directRecipientUserId?: string;
  content!: string;
  messageType?: 'text' | 'system' | 'agent';
}
