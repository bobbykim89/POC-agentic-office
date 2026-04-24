# Domain Model

## Core Entities
### User
- id
- username
- email
- spriteSheetUrl

### Room
- id
- name
- type (office | meeting)

### Conversation
- id
- type (direct | group)
- createdAt

### ConversationParticipant
- id
- conversationId
- userId

### Message
- id
- conversationId
- senderId
- content
- messageType (text | system | agent)
- createdAt
- updatedAt
- deletedAt (nullable)

### ConversationRead
- id
- conversationId
- userId
- lastReadMessageId
- lastReadAt

### Presence
- userId
- status (online | offline)
- lastSeenAt

### Coordinates
- userId
- x
- y
- updatedAt

### AgentJob
- id
- userId
- type
- status (pending | completed | failed)
- requestPayload
- responsePayload
- createdAt
- updatedAt
