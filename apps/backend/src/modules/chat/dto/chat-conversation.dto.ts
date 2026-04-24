import type { ChatMessageDto } from './chat-message.dto';
import type { ChatUserDto } from './chat-user.dto';

export interface ChatConversationDto {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  roomId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  participants: ChatUserDto[];
  latestMessage: ChatMessageDto | null;
  unreadCount: number;
}
