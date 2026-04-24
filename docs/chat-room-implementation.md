# Chat Room Implementation

## Goal

Add a 1:1 direct-message chat experience to the office client.

The MVP is triggered from the Phaser interaction zone with id `meeting-room-table`.

When the user interacts with that zone:

1. The game opens a chat modal.
2. The modal shows a people-first directory of all users except the current user.
3. If a direct conversation already exists with a selected user, the modal loads prior messages.
4. If no direct conversation exists yet, the modal shows an empty thread and creates the conversation on first send.
5. The modal shows whether the other user is online or offline.

This MVP is direct-message only. Group chat is out of scope.

## Architecture Boundaries

### Phaser

Phaser is responsible only for:

- detecting interaction with `meeting-room-table`
- opening the Vue chat modal
- locking character movement while the modal is open

Phaser should not own chat state, message history, or socket logic.

### Vue Client

The client owns:

- modal visibility
- user directory loading
- direct conversation selection
- message history rendering
- sending messages
- presence state for online/offline indicators

### NestJS Backend

The backend owns:

- user directory data
- chat privacy enforcement
- direct conversation creation and lookup
- message persistence
- read tracking
- websocket chat delivery
- websocket presence state

### Database

Postgres remains the durable source of truth for:

- users
- conversations
- conversation participants
- messages
- conversation reads

Presence remains transient realtime state.

## Existing Backend Support

The current backend already supports the core direct-message domain:

- `GET /chat/conversations`
- `GET /chat/conversations/:conversationId/messages`
- `POST /chat/messages`

The current chat service already:

- enforces participant-only access
- finds or creates direct conversations
- persists messages
- updates `conversation_reads`

The main missing backend surface for the MVP is a user directory endpoint for chat discovery.

## Required Backend Additions

### User Directory

Add:

- `GET /users`

Response shape:

```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "username": "string",
      "displayName": null,
      "spriteSheetUrl": null
    }
  ]
}
```

Rules:

- exclude the authenticated user
- do not return email or auth-sensitive fields
- sort predictably for stable UI

## Realtime Strategy

The chat modal should use the existing `/realtime` websocket namespace for presence and live incoming messages.

### Presence

On socket connect:

1. client connects with JWT
2. client emits `presence:join`
3. server returns a `presence:update` snapshot

The modal keeps a `presenceByUserId` map:

- online when `socketCount > 0`
- offline otherwise

### Chat Message Updates

The backend already emits `chat:message` events to conversation rooms.

The chat modal should listen for `chat:message` and append messages to the active thread when:

- the message belongs to the selected conversation

It should also update the left-hand conversation preview list when a new message arrives.

## Frontend MVP Flow

### Open

1. user interacts with `meeting-room-table`
2. client opens `ChatModal`
3. modal loads:
   - `GET /users`
   - `GET /chat/conversations`

### Left Panel

The left panel is people-first:

- show all users except self
- if a direct conversation exists for a user, attach:
  - `conversationId`
  - `latestMessage`
  - `lastMessageAt`
- show online/offline status

Recommended ordering:

1. users with an existing direct conversation, newest first
2. remaining users, alphabetical

### Thread Panel

When a user is selected:

- if `conversationId` exists:
  - load `GET /chat/conversations/:conversationId/messages`
- if not:
  - show an empty state such as `Start a conversation with <name>.`

### Send

When sending:

- if an existing direct conversation exists:
  - `POST /chat/messages` with `conversationId`
- if not:
  - `POST /chat/messages` with `directRecipientUserId`

The backend is responsible for creating the direct conversation if needed.

### Read Tracking

Read tracking is already implemented server-side when messages are fetched.

For the MVP, opening the thread and loading messages is enough to mark it read.

## UI Shape

Recommended modal structure:

- left column:
  - title
  - optional search input
  - list of users
- right column:
  - selected user header
  - online/offline badge
  - scrollable message thread
  - composer at bottom

This should look like a standard DM interface, not a stylized in-world dialogue box.

## Data Resolution Rules

For a selected user, the client derives the direct conversation by filtering:

- conversation `type === "direct"`
- participants contain the selected user and current user

The other participant for a direct conversation is the participant whose id does not equal the current authenticated user id.

## Privacy Rules

- only authenticated users can access the chat modal data
- users may only load messages for conversations they participate in
- users may only send into conversations they participate in
- direct conversations must never be exposed to non-participants

These rules are already enforced by the chat domain and must remain there, not in the client.

## Suggested Delivery Order

1. add `GET /users`
2. add `meeting-room-table` modal trigger
3. implement `ChatModal`
4. load directory and existing conversations
5. load and send messages via REST
6. add presence via `/realtime`
7. add live incoming message updates

## Known Constraints

- presence is currently in-memory, so online/offline is process-local
- direct chat exists today; group chat is not included in this MVP
- unread badges can be added later, but are not required for first delivery
- message pagination can stay simple for now
