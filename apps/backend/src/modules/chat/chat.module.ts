import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ChatController } from './controllers/chat.controller';
import { ConversationReadsRepository } from './repositories/conversation-reads.repository';
import { ConversationsRepository } from './repositories/conversations.repository';
import { MessagesRepository } from './repositories/messages.repository';
import { ChatService } from './services/chat.service';

@Module({
  imports: [UsersModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ConversationsRepository,
    MessagesRepository,
    ConversationReadsRepository,
  ],
  exports: [ChatService],
})
export class ChatModule {}
