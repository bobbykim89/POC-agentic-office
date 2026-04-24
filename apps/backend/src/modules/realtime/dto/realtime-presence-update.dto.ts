export interface RealtimePresenceUpdateDto {
  status: 'online' | 'offline';
  roomId?: string | null;
}
