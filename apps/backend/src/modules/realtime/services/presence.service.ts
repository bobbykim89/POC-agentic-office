import { Injectable } from '@nestjs/common';
import type { RealtimePresenceDto } from '../dto/realtime-presence.dto';
import type { RealtimeUserPositionDto } from '../dto/realtime-user-position.dto';

@Injectable()
export class PresenceService {
  private readonly socketToUserId = new Map<string, string>();
  private readonly userToSocketIds = new Map<string, Set<string>>();
  private readonly userPresence = new Map<string, RealtimePresenceDto>();
  private readonly roomToUserIds = new Map<string, Set<string>>();
  private readonly userPositions = new Map<string, RealtimeUserPositionDto>();

  registerConnection(userId: string, socketId: string): RealtimePresenceDto {
    this.socketToUserId.set(socketId, userId);

    const socketIds = this.userToSocketIds.get(userId) ?? new Set<string>();
    socketIds.add(socketId);
    this.userToSocketIds.set(userId, socketIds);

    const previous = this.userPresence.get(userId);
    const presence: RealtimePresenceDto = {
      userId,
      status: 'online',
      socketCount: socketIds.size,
      currentRoomId: previous?.currentRoomId ?? null,
      lastSeenAt: new Date().toISOString(),
    };

    this.userPresence.set(userId, presence);
    return presence;
  }

  unregisterConnection(socketId: string): RealtimePresenceDto | null {
    const userId = this.socketToUserId.get(socketId);
    if (!userId) {
      return null;
    }

    this.socketToUserId.delete(socketId);
    const socketIds = this.userToSocketIds.get(userId) ?? new Set<string>();
    socketIds.delete(socketId);

    if (socketIds.size > 0) {
      this.userToSocketIds.set(userId, socketIds);
      const previous = this.userPresence.get(userId);
      const presence: RealtimePresenceDto = {
        userId,
        status: 'online',
        socketCount: socketIds.size,
        currentRoomId: previous?.currentRoomId ?? null,
        lastSeenAt: new Date().toISOString(),
      };
      this.userPresence.set(userId, presence);
      return presence;
    }

    this.userToSocketIds.delete(userId);
    this.removeUserFromCurrentRoom(userId);

    const presence: RealtimePresenceDto = {
      userId,
      status: 'offline',
      socketCount: 0,
      currentRoomId: null,
      lastSeenAt: new Date().toISOString(),
    };
    this.userPresence.set(userId, presence);
    return presence;
  }

  joinRoom(userId: string, roomId: string): RealtimePresenceDto {
    const current = this.userPresence.get(userId) ?? {
      userId,
      status: 'online' as const,
      socketCount: this.userToSocketIds.get(userId)?.size ?? 0,
      currentRoomId: null,
      lastSeenAt: new Date().toISOString(),
    };

    if (current.currentRoomId && current.currentRoomId !== roomId) {
      this.leaveRoom(userId, current.currentRoomId);
    }

    const userIds = this.roomToUserIds.get(roomId) ?? new Set<string>();
    userIds.add(userId);
    this.roomToUserIds.set(roomId, userIds);

    const presence: RealtimePresenceDto = {
      ...current,
      currentRoomId: roomId,
      lastSeenAt: new Date().toISOString(),
    };
    this.userPresence.set(userId, presence);
    return presence;
  }

  leaveRoom(userId: string, roomId: string): RealtimePresenceDto {
    const userIds = this.roomToUserIds.get(roomId);
    userIds?.delete(userId);
    if (userIds && userIds.size === 0) {
      this.roomToUserIds.delete(roomId);
    }

    const current = this.userPresence.get(userId) ?? {
      userId,
      status: 'online' as const,
      socketCount: this.userToSocketIds.get(userId)?.size ?? 0,
      currentRoomId: null,
      lastSeenAt: new Date().toISOString(),
    };

    const presence: RealtimePresenceDto = {
      ...current,
      currentRoomId: current.currentRoomId === roomId ? null : current.currentRoomId,
      lastSeenAt: new Date().toISOString(),
    };
    this.userPresence.set(userId, presence);
    return presence;
  }

  updatePosition(userId: string, roomId: string, x: number, y: number): RealtimeUserPositionDto {
    const position: RealtimeUserPositionDto = {
      userId,
      roomId,
      x,
      y,
      updatedAt: new Date().toISOString(),
    };
    this.userPositions.set(userId, position);
    this.joinRoom(userId, roomId);
    return position;
  }

  getConnectedPresence(): RealtimePresenceDto[] {
    return [...this.userPresence.values()].filter((presence) => presence.socketCount > 0);
  }

  getRoomUserIds(roomId: string): string[] {
    return [...(this.roomToUserIds.get(roomId) ?? new Set<string>())];
  }

  getRoomState(roomId: string): RealtimeUserPositionDto[] {
    return [...this.userPositions.values()].filter((position) => position.roomId === roomId);
  }

  getUserSocketIds(userId: string): string[] {
    return [...(this.userToSocketIds.get(userId) ?? new Set<string>())];
  }

  private removeUserFromCurrentRoom(userId: string) {
    const currentRoomId = this.userPresence.get(userId)?.currentRoomId;
    if (!currentRoomId) {
      return;
    }

    const userIds = this.roomToUserIds.get(currentRoomId);
    userIds?.delete(userId);
    if (userIds && userIds.size === 0) {
      this.roomToUserIds.delete(currentRoomId);
    }
  }
}
