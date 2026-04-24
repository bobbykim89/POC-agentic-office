export const REALTIME_EVENTS = {
  PRESENCE_JOIN: 'presence:join',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  CHAT_SEND: 'chat:send',
  CHAT_TYPING: 'chat:typing',
  USER_MOVE: 'user:move',
  AGENT_REQUEST: 'agent:request',
  PRESENCE_UPDATE: 'presence:update',
  ROOM_STATE: 'room:state',
  CHAT_ACK: 'chat:ack',
  CHAT_MESSAGE: 'chat:message',
  USER_POSITION: 'user:position',
  AGENT_PENDING: 'agent:pending',
  AGENT_RESULT: 'agent:result',
  AGENT_ERROR: 'agent:error',
  ERROR: 'error',
} as const;

export type RealtimeEventName =
  (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];
