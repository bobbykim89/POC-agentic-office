import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WsException,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { REALTIME_EVENTS } from '../../../common/constants/realtime-events.constants';
import type { WsEventEnvelope } from '../../../common/interfaces/ws-event.interface';
import { ChatService } from '../../chat/services/chat.service';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { RealtimeChatSendDto } from '../dto/realtime-chat-send.dto';
import type { RealtimePresenceUpdateDto } from '../dto/realtime-presence-update.dto';
import type { RealtimeUserMoveDto } from '../dto/realtime-user-move.dto';
import { RealtimeAuthService } from '../services/realtime-auth.service';
import { RealtimeEmitterService } from '../services/realtime-emitter.service';
import { PresenceService } from '../services/presence.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly presenceService: PresenceService,
    private readonly realtimeEmitterService: RealtimeEmitterService,
    private readonly realtimeAuthService: RealtimeAuthService,
  ) {}

  async handleConnection(client: Socket) {
    this.realtimeEmitterService.registerServer(this.server);

    const token = this.realtimeAuthService.extractSocketToken(client);
    if (!token) {
      client.disconnect();
      throw new WsException('Authentication token is required.');
    }

    try {
      client.data.user = await this.realtimeAuthService.validateSocketToken(token);
      const user = this.requireAuthenticatedUser(client);
      client.join(this.userRoom(user.userId));
      const conversationIds = await this.chatService.getConversationIdsForUser(user.userId);
      for (const conversationId of conversationIds) {
        client.join(this.conversationRoom(conversationId));
      }
      const presence = this.presenceService.registerConnection(user.userId, client.id);
      const connectedUserIds = this.presenceService
        .getConnectedPresence()
        .map((entry) => entry.userId);
      this.realtimeEmitterService.emitPresenceUpdateToUsers(connectedUserIds, presence);
    } catch {
      client.disconnect();
      throw new WsException('Authentication failed.');
    }
  }

  handleDisconnect(client: Socket) {
    const presence = this.presenceService.unregisterConnection(client.id);
    if (!presence) {
      return;
    }

    const connectedUserIds = this.presenceService
      .getConnectedPresence()
      .map((entry) => entry.userId);
    this.realtimeEmitterService.emitPresenceUpdateToUsers(
      [...connectedUserIds, presence.userId],
      presence,
    );
  }

  @SubscribeMessage(REALTIME_EVENTS.PRESENCE_JOIN)
  handlePresenceJoin(@ConnectedSocket() client: Socket) {
    const user = this.requireAuthenticatedUser(client);
    const presence = this.presenceService.registerConnection(user.userId, client.id);
    const snapshot = this.presenceService.getConnectedPresence();

    return this.ok(REALTIME_EVENTS.PRESENCE_UPDATE, {
      self: presence,
      users: snapshot,
    });
  }

  @SubscribeMessage(REALTIME_EVENTS.PRESENCE_UPDATE)
  handlePresenceUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RealtimePresenceUpdateDto,
  ) {
    const user = this.requireAuthenticatedUser(client);

    let presence =
      payload.status === 'offline'
        ? this.presenceService.leaveRoom(
            user.userId,
            this.presenceService.getConnectedPresence().find((entry) => entry.userId === user.userId)
              ?.currentRoomId ?? '',
          )
        : this.presenceService.registerConnection(user.userId, client.id);

    if (payload.roomId?.trim()) {
      presence = this.presenceService.joinRoom(user.userId, payload.roomId.trim());
      client.join(this.roomRoom(payload.roomId.trim()));
    }

    const targetUserIds = payload.roomId?.trim()
      ? this.presenceService.getRoomUserIds(payload.roomId.trim())
      : this.presenceService.getConnectedPresence().map((entry) => entry.userId);
    this.realtimeEmitterService.emitPresenceUpdateToUsers(
      [...targetUserIds, user.userId],
      presence,
    );

    return this.ok(REALTIME_EVENTS.PRESENCE_UPDATE, {
      user: presence,
    });
  }

  @SubscribeMessage(REALTIME_EVENTS.CHAT_SEND)
  async handleChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RealtimeChatSendDto,
  ) {
    const user = this.requireAuthenticatedUser(client);

    try {
      const result = await this.chatService.sendMessageForRealtime(user.userId, payload);
      this.joinConversationForUsers(result.message.conversationId, result.participantUserIds);
      this.realtimeEmitterService.emitChatMessageToConversation(
        result.message.conversationId,
        result.message,
      );

      return this.ok(
        REALTIME_EVENTS.CHAT_MESSAGE,
        {
          requestId: payload.requestId ?? null,
          message: result.message,
        },
        REALTIME_EVENTS.CHAT_ACK,
      );
    } catch (error) {
      return this.error(error);
    }
  }

  @SubscribeMessage(REALTIME_EVENTS.USER_MOVE)
  async handleUserMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RealtimeUserMoveDto,
  ) {
    const user = this.requireAuthenticatedUser(client);

    if (!payload.roomId?.trim()) {
      return this.error(new WsException('roomId is required.'));
    }

    if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) {
      return this.error(new WsException('x and y must be numbers.'));
    }

    const position = this.presenceService.updatePosition(
      user.userId,
      payload.roomId.trim(),
      Math.round(payload.x),
      Math.round(payload.y),
    );
    client.join(this.roomRoom(position.roomId));

    this.realtimeEmitterService.emitUserMoveToRoom(position.roomId, position);

    return this.ok(REALTIME_EVENTS.USER_MOVE, position);
  }

  emitAgentResultToUsers(userIds: string[], result: {
    jobId: string;
    type: string;
    status: 'completed' | 'failed';
    conversationId?: string | null;
    result?: Record<string, unknown>;
    error?: {
      code: string;
      message: string;
    };
  }) {
    this.realtimeEmitterService.emitAgentResultToUsers(userIds, result);
  }

  private requireAuthenticatedUser(client: Socket): AuthenticatedUser {
    const user = client.data.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new WsException('Authentication required.');
    }

    return user;
  }

  private ok<TData>(event: string, data: TData, ackEvent = event) {
    return {
      event: ackEvent,
      data: {
        event,
        ok: true,
        data,
      } satisfies WsEventEnvelope<TData>,
    };
  }

  private error(error: unknown) {
    const message = error instanceof Error ? error.message : 'Realtime request failed.';
    return {
      event: REALTIME_EVENTS.ERROR,
      data: {
        event: REALTIME_EVENTS.ERROR,
        ok: false,
        error: {
          code: 'REALTIME_ERROR',
          message,
        },
      } satisfies WsEventEnvelope,
    };
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

  private joinConversationForUsers(conversationId: string, userIds: string[]) {
    const room = this.conversationRoom(conversationId);
    const uniqueUserIds = [...new Set(userIds)];

    for (const userId of uniqueUserIds) {
      const socketIds = this.presenceService.getUserSocketIds(userId);
      for (const socketId of socketIds) {
        this.server.in(socketId).socketsJoin(room);
      }
    }
  }
}
