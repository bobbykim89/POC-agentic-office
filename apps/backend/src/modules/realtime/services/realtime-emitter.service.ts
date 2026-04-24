import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { REALTIME_EVENTS } from '../../../common/constants/realtime-events.constants';
import type { WsEventEnvelope } from '../../../common/interfaces/ws-event.interface';
import type { RealtimeAgentResultDto } from '../dto/realtime-agent-result.dto';
import type { RealtimePresenceDto } from '../dto/realtime-presence.dto';
import type { RealtimeUserPositionDto } from '../dto/realtime-user-position.dto';
import type { ChatMessageDto } from '../../chat/dto/chat-message.dto';

@Injectable()
export class RealtimeEmitterService {
  private server: Server | null = null;

  registerServer(server: Server) {
    this.server = server;
  }

  getServer(): Server | null {
    return this.server;
  }

  emitPresenceUpdateToUsers(userIds: string[], presence: RealtimePresenceDto) {
    this.emitToUsers(userIds, REALTIME_EVENTS.PRESENCE_UPDATE, {
      user: presence,
    });
  }

  emitChatMessageToConversation(conversationId: string, message: ChatMessageDto) {
    this.emitToConversation(conversationId, REALTIME_EVENTS.CHAT_MESSAGE, {
      conversationId,
      message,
    });
  }

  emitUserMoveToRoom(roomId: string, position: RealtimeUserPositionDto) {
    this.emitToRoom(roomId, REALTIME_EVENTS.USER_MOVE, position);
  }

  emitAgentResultToUsers(
    userIds: string[],
    result: RealtimeAgentResultDto & { conversationId?: string | null },
  ) {
    this.emitToUsers(userIds, REALTIME_EVENTS.AGENT_RESULT, result);
    if (result.conversationId) {
      this.emitToConversation(result.conversationId, REALTIME_EVENTS.AGENT_RESULT, result);
    }
  }

  emitErrorToSocket(socketId: string, code: string, message: string) {
    this.server?.to(socketId).emit(REALTIME_EVENTS.ERROR, {
      event: REALTIME_EVENTS.ERROR,
      ok: false,
      error: {
        code,
        message,
      },
    } satisfies WsEventEnvelope);
  }

  private emitToUsers<TData>(userIds: string[], event: string, data: TData) {
    const uniqueUserIds = [...new Set(userIds)];
    for (const userId of uniqueUserIds) {
      this.server?.to(this.userRoom(userId)).emit(event, {
        event,
        ok: true,
        data,
      } satisfies WsEventEnvelope<TData>);
    }
  }

  private emitToConversation<TData>(conversationId: string, event: string, data: TData) {
    this.server?.to(this.conversationRoom(conversationId)).emit(event, {
      event,
      ok: true,
      data,
    } satisfies WsEventEnvelope<TData>);
  }

  private emitToRoom<TData>(roomId: string, event: string, data: TData) {
    this.server?.to(this.roomRoom(roomId)).emit(event, {
      event,
      ok: true,
      data,
    } satisfies WsEventEnvelope<TData>);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private conversationRoom(conversationId: string) {
    return `conversation:${conversationId}`;
  }

  private roomRoom(roomId: string) {
    return `room:${roomId}`;
  }
}
