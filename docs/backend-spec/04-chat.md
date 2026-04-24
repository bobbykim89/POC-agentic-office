# Chat System

## Types
### Direct Chat
- 1:1 conversation
- Created when user interacts with another user

### Group Chat
- Created via meeting-room interaction
- Multiple participants

## Rules
- Only participants can read messages.
- Messages persist in the database.
- Offline users receive messages when they reconnect.

## Read Tracking
- Use a conversation_reads table.
- Track lastReadMessageId per user.

## Message Lifecycle
- send -> persist -> broadcast
- edit is optional
- soft delete is supported

## Visibility
- Chat is private to participants only.
