import type { ChatUserDto } from './chat-user.dto';

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  sender: ChatUserDto | null;
  content: string;
  messageType: 'text' | 'system' | 'agent';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
