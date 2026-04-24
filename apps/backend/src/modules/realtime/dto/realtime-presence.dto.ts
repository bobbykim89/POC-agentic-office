export interface RealtimePresenceDto {
  userId: string;
  status: 'online' | 'offline';
  socketCount: number;
  currentRoomId: string | null;
  lastSeenAt: string;
}
