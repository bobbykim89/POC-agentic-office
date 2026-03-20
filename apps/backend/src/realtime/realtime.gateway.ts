import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type {
  ApiEvent,
  ChatMessagePayload,
  ChatSendDto,
  RealtimeEnvelope,
} from '@agentic-office/shared-types';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    const welcomeEvent: ApiEvent<ChatMessagePayload> = {
      id: `evt_socket_connected_${client.id}`,
      type: 'chat.message',
      payload: {
        sender: 'system',
        message: 'Realtime gateway connected. Send a message to test the round-trip.',
        clientId: client.id,
      },
      createdAt: new Date().toISOString(),
    };

    client.emit('system:welcome', {
      channel: 'system',
      event: welcomeEvent,
    } satisfies RealtimeEnvelope<ChatMessagePayload>);
  }

  handleDisconnect(client: Socket) {
    this.server.emit('system:presence', {
      channel: 'system',
      event: {
        id: `evt_socket_disconnected_${client.id}`,
        type: 'chat.message',
        payload: {
          sender: 'system',
          message: `Client ${client.id} disconnected.`,
          clientId: client.id,
        },
        createdAt: new Date().toISOString(),
      },
    } satisfies RealtimeEnvelope<ChatMessagePayload>);
  }

  @SubscribeMessage('office:ping')
  handlePing(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: Record<string, unknown> = {},
  ) {
    const pongEvent: ApiEvent<{ clientId: string; received: Record<string, unknown> }> = {
      id: `evt_socket_ping_${client.id}`,
      type: 'socket.pong',
      payload: {
        clientId: client.id,
        received: payload,
      },
      createdAt: new Date().toISOString(),
    };

    return {
      event: 'office:pong',
      data: {
        channel: 'office',
        event: pongEvent,
      } satisfies RealtimeEnvelope<{ clientId: string; received: Record<string, unknown> }>,
    };
  }

  @SubscribeMessage('chat:send')
  handleChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatSendDto,
  ) {
    const message = payload.message.trim();

    if (!message) {
      return {
        event: 'chat:error',
        data: {
          channel: 'chat',
          event: {
            id: `evt_chat_error_${client.id}_${Date.now()}`,
            type: 'chat.message',
            payload: {
              sender: 'system',
              message: 'Please enter a message before sending.',
              clientId: client.id,
            },
            createdAt: new Date().toISOString(),
          },
        } satisfies RealtimeEnvelope<ChatMessagePayload>,
      };
    }

    const userEnvelope = this.createChatEnvelope('user', message, client.id);
    this.server.emit('chat:message', userEnvelope);

    const assistantReply = this.buildAssistantReply(message);
    const assistantEnvelope = this.createChatEnvelope('assistant', assistantReply, client.id);

    setTimeout(() => {
      this.server.emit('chat:message', assistantEnvelope);
    }, 450);

    return {
      event: 'chat:ack',
      data: userEnvelope,
    };
  }

  private createChatEnvelope(
    sender: ChatMessagePayload['sender'],
    message: string,
    clientId?: string,
  ): RealtimeEnvelope<ChatMessagePayload> {
    return {
      channel: 'chat',
      event: {
        id: `evt_chat_${sender}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'chat.message',
        payload: {
          sender,
          message,
          clientId,
        },
        createdAt: new Date().toISOString(),
      },
    };
  }

  private buildAssistantReply(message: string): string {
    return `Echo from Nest realtime gateway: "${message}" received and broadcast successfully.`;
  }
}
