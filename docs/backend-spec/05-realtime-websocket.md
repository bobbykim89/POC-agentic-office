# WebSocket Specification

## Purpose
Use WebSocket for:
- Live chat delivery
- Presence updates
- User coordinates
- Typing indicators
- Agent result notifications

## Connection Flow
1. Client connects.
2. Client sends JWT.
3. Server authenticates.
4. Server joins the client to personal and conversation channels.

## Client -> Server Events
- presence:join
- room:join
- room:leave
- chat:send
- chat:typing
- user:move
- agent:request

## Server -> Client Events
- presence:update
- room:state
- chat:ack
- chat:message
- user:position
- agent:pending
- agent:result
- agent:error
- error

## Event Shape
{
  "event": "chat:message",
  "ok": true,
  "data": {}
}

## Rules
- Every important request should receive ack or error.
- Do not block sockets for slow AI work.
- For slow AI responses, return pending first and push result later.
