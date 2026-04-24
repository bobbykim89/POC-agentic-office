# Backend API Reference

This document describes the current NestJS backend in `apps/backend`.

## Overview

- Base URL: `http://localhost:3000`
- REST auth: `Authorization: Bearer <accessToken>`
- WebSocket namespace: `/realtime`
- Default rule: all routes require JWT auth unless marked public
- Public routes: `GET /health`, `GET /health/database`, `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`

## Response Format

Successful REST responses:

```json
{
  "ok": true,
  "data": {}
}
```

Error REST responses:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

Notes:
- `details` may appear on `error` in some cases, but most handlers currently return `code` and `message`.
- WebSocket events use the same shape plus an `event` field.

## Auth Model

- Access token: sent in `Authorization` header for protected REST routes
- Refresh token: sent in request body to `POST /auth/refresh`
- Signup: public `POST /auth/signup` creates a user account with username, email, and password
- Logout clears the stored refresh token hash
- `GET /auth/me` and `GET /users/me` return the authenticated user profile

User shape:

```json
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "displayName": "string | null",
  "spriteSheetUrl": "string | null"
}
```

## REST Endpoints

### Health

#### `GET /health`
Public health check.

Request body: none

Response:

```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "service": "backend",
    "timestamp": "2026-04-22T00:00:00.000Z"
  }
}
```

#### `GET /health/database`
Public database status check.

Request body: none

Response:

```json
{
  "ok": true,
  "data": {
    "connected": true,
    "dialect": "postgresql",
    "drizzle": true,
    "urlConfigured": true
  }
}
```

### Auth

#### `POST /auth/signup`
Public registration endpoint. Creates a user, issues access/refresh tokens, and returns the authenticated user profile without password or hash fields.

Request body:

```json
{
  "username": "jane",
  "email": "jane@example.com",
  "password": "password123"
}
```

Validation:
- `username` is required
- `email` must be a valid email
- `password` must be at least `8` characters
- unknown fields are stripped by the route-level validation pipe

Response:

```json
{
  "ok": true,
  "data": {
    "tokens": {
      "accessToken": "jwt",
      "refreshToken": "jwt"
    },
    "user": {
      "id": "uuid",
      "username": "jane",
      "email": "jane@example.com",
      "displayName": null,
      "spriteSheetUrl": null
    }
  }
}
```

Common errors:
- `AUTH_EMAIL_ALREADY_EXISTS`
- `BAD_REQUEST`

#### `POST /auth/login`
Email/password login. Returns access and refresh tokens plus the user profile.

Request body:

```json
{
  "email": "user@example.com",
  "password": "plain-text-password"
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "tokens": {
      "accessToken": "jwt",
      "refreshToken": "jwt"
    },
    "user": {
      "id": "uuid",
      "username": "string",
      "email": "user@example.com",
      "displayName": "string | null",
      "spriteSheetUrl": "string | null"
    }
  }
}
```

Common errors:
- `INVALID_CREDENTIALS`
- `BAD_REQUEST`

#### `POST /auth/refresh`
Rotates refresh token and returns a fresh access/refresh pair.

Request body:

```json
{
  "refreshToken": "jwt"
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "accessToken": "jwt",
    "refreshToken": "jwt"
  }
}
```

Common errors:
- `REFRESH_TOKEN_INVALID`
- `BAD_REQUEST`

#### `POST /auth/logout`
Revokes the stored refresh token for the authenticated user.

Headers:
- `Authorization: Bearer <accessToken>`

Request body: none

Response:

```json
{
  "ok": true,
  "data": {
    "loggedOut": true
  }
}
```

#### `GET /auth/me`
Returns the authenticated user profile.

Headers:
- `Authorization: Bearer <accessToken>`

Request body: none

Response:

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "username": "string",
    "email": "user@example.com",
    "displayName": "string | null",
    "spriteSheetUrl": "string | null"
  }
}
```

### Users

#### `GET /users/me`
Duplicate authenticated profile endpoint owned by the users module.

Headers:
- `Authorization: Bearer <accessToken>`

Request body: none

Response:

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "username": "string",
    "email": "user@example.com",
    "displayName": "string | null",
    "spriteSheetUrl": "string | null"
  }
}
```

### Chat

Chat access rule:
- only conversation participants can read messages from an existing conversation
- sending a direct message can create a 1:1 conversation automatically when `conversationId` is omitted

Conversation shape:

```json
{
  "id": "uuid",
  "type": "direct | group",
  "title": "string | null",
  "roomId": "string | null",
  "createdBy": "uuid | null",
  "createdAt": "ISO date",
  "updatedAt": "ISO date",
  "lastMessageAt": "ISO date | null",
  "participants": [
    {
      "id": "uuid",
      "username": "string",
      "displayName": "string | null",
      "spriteSheetUrl": "string | null"
    }
  ],
  "latestMessage": {
    "id": "uuid",
    "conversationId": "uuid",
    "sender": {
      "id": "uuid",
      "username": "string",
      "displayName": "string | null",
      "spriteSheetUrl": "string | null"
    },
    "content": "string",
    "messageType": "text",
    "createdAt": "ISO date",
    "updatedAt": "ISO date",
    "deletedAt": null
  },
  "unreadCount": 0
}
```

Message shape:

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "sender": {
    "id": "uuid",
    "username": "string",
    "displayName": "string | null",
    "spriteSheetUrl": "string | null"
  },
  "content": "string",
  "messageType": "text | system | agent",
  "createdAt": "ISO date",
  "updatedAt": "ISO date",
  "deletedAt": "ISO date | null"
}
```

#### `GET /chat/conversations`
Returns the authenticated user’s conversation list with participants, latest message, and unread count.

Headers:
- `Authorization: Bearer <accessToken>`

Request body: none

Response:

```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "type": "direct",
      "title": null,
      "roomId": null,
      "createdBy": "uuid",
      "createdAt": "ISO date",
      "updatedAt": "ISO date",
      "lastMessageAt": "ISO date | null",
      "participants": [],
      "latestMessage": null,
      "unreadCount": 0
    }
  ]
}
```

#### `GET /chat/conversations/:conversationId/messages`
Returns recent messages for one conversation and updates read tracking for the caller.

Headers:
- `Authorization: Bearer <accessToken>`

Query params:
- `limit?: string`

Behavior:
- default limit is `50`
- minimum is `1`
- maximum is `100`

Request body: none

Response:

```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "conversationId": "uuid",
      "sender": null,
      "content": "string",
      "messageType": "text",
      "createdAt": "ISO date",
      "updatedAt": "ISO date",
      "deletedAt": null
    }
  ]
}
```

Common errors:
- `FORBIDDEN` when the caller is not a participant

#### `POST /chat/messages`
REST fallback for sending a message. Supports existing conversations and auto-created direct conversations.

Headers:
- `Authorization: Bearer <accessToken>`

Request body:

```json
{
  "conversationId": "uuid",
  "directRecipientUserId": "uuid",
  "content": "hello",
  "messageType": "text"
}
```

Rules:
- provide `conversationId` for an existing chat
- or provide `directRecipientUserId` to send/create a direct chat
- `content` is required
- `messageType` defaults to `text`

Response:

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "conversationId": "uuid",
    "sender": {
      "id": "uuid",
      "username": "string",
      "displayName": "string | null",
      "spriteSheetUrl": "string | null"
    },
    "content": "hello",
    "messageType": "text",
    "createdAt": "ISO date",
    "updatedAt": "ISO date",
    "deletedAt": null
  }
}
```

Common errors:
- `BAD_REQUEST` for empty content or missing target
- `NOT_FOUND` if the direct recipient does not exist
- `FORBIDDEN` if the caller is not a participant in the target conversation

### Integrations

Microsoft Outlook integration is now backend-owned.

All integration routes:
- require JWT auth unless noted public
- are user-scoped
- persist Microsoft account linkage and encrypted tokens in Postgres

#### `GET /integrations/microsoft/accounts`
Returns the authenticated user’s connected Microsoft accounts.

Headers:
- `Authorization: Bearer <accessToken>`

Request body: none

Response:

```json
{
  "ok": true,
  "data": [
    {
      "id": "uuid",
      "provider": "microsoft",
      "accountEmail": "user@example.com",
      "connectedAt": "ISO date",
      "scopes": [],
      "tokenExpiresAt": "ISO date | null"
    }
  ]
}
```

#### `GET /integrations/microsoft/oauth/start`
Starts the Microsoft OAuth flow for the authenticated user.

Headers:
- `Authorization: Bearer <accessToken>`

Query params:
- `redirectTo?: string`

Response:

```json
{
  "ok": true,
  "data": {
    "authorizationUrl": "https://login.microsoftonline.com/...",
    "state": "opaque-state",
    "expiresAt": "ISO date"
  }
}
```

#### `GET /integrations/microsoft/oauth/callback`
Public Microsoft OAuth callback. This route does not return the normal JSON envelope; it redirects the browser back to the client.

Query params:
- `state: string`
- `code: string`

Behavior:
- on success, redirects to the client with `?microsoft=connected&account=...&open=weekly-report`
- on failure, redirects to the client with `?microsoft=error&message=...&open=weekly-report`

### Agent Bridge

All agent routes:
- require JWT auth
- respond synchronously with `{ ok: true, data }`
- normalize AI-service failures into the backend error envelope
- log bridge requests centrally

#### `POST /agents/linkedin-post`
Creates a LinkedIn-style post synchronously.

Request body:

```json
{
  "text": "source text"
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "post": "generated post",
    "source_text": "source text",
    "tone": "playful-linkedin",
    "model": "gpt-5-mini"
  }
}
```

#### `POST /agents/sprite-sheet`
Creates a sprite sheet synchronously, persists the Cloudinary `secure_url` into the authenticated user’s `spriteSheetUrl`, and returns the updated user profile plus the raw sprite payload.

Headers:
- `Authorization: Bearer <accessToken>`

Request body:

```json
{
  "description": "optional text prompt",
  "imageBase64": "optional base64 image",
  "imageMimeType": "optional mime type"
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "spriteSheetUrl": "https://res.cloudinary.com/...",
    "user": {
      "id": "uuid",
      "username": "user",
      "email": "user@example.com",
      "displayName": null,
      "spriteSheetUrl": "https://res.cloudinary.com/..."
    },
    "sprite": {
      "character_description": "retro office worker",
      "input_kind": "description",
      "file_name": "sprite.png",
      "relative_image_path": "generated/sprites/sprite.png",
      "absolute_image_path": "/abs/path/sprite.png",
      "image_width": 1536,
      "image_height": 1024,
      "final_sprite_height": 256,
      "generation_attempts": 1,
      "generation_model": "gpt-image-1",
      "validation": {},
      "storage_record": {
        "cloudinary": {
          "secure_url": "https://res.cloudinary.com/..."
        }
      }
    }
  }
}
```

Notes:
- the backend expects the AI service to return `storage_record.cloudinary.secure_url`
- if sprite generation succeeds but no Cloudinary URL is present, the backend rejects the request instead of persisting a local file path

#### `GET /agents/ai-news`
Returns one AI-news summary synchronously.

Request body: none

Response: `200` with `{ ok: true, data }`

#### `GET /agents/weekly-report/microsoft/auth/start`
Legacy passthrough for AI-service-owned Microsoft auth start. Prefer `GET /integrations/microsoft/oauth/start` for the active product flow.

Request body: none

Response: `200` with `{ ok: true, data }`

Expected upstream result:

```json
{
  "authorization_url": "string",
  "state": "string"
}
```

#### `GET /agents/weekly-report/microsoft/accounts`
Legacy passthrough for AI-service-owned account lookup. Prefer `GET /integrations/microsoft/accounts` for the active product flow.

Request body: none

Response: `200` with `{ ok: true, data }`

#### `GET /agents/weekly-report/history`
Returns recent 515-style sent mail using the backend-owned Microsoft connection for the authenticated user.

Headers:
- `Authorization: Bearer <accessToken>`

Query params:
- `account_email: string`
- `query?: string`
- `max_results?: number`

Response:

```json
{
  "ok": true,
  "data": {
    "account_email": "user@example.com",
    "query": "515 report",
    "emails": [],
    "last_week_email": null
  }
}
```

#### `POST /agents/weekly-report/draft`
Drafts a weekly report using backend-owned Outlook history plus AI-service drafting.

Request body:

```json
{
  "account_email": "user@example.com",
  "weekly_summary": "summary text",
  "query": "optional search",
  "max_examples": 5,
  "recipient_override": "optional email",
  "subject_override": "optional subject"
}
```

Response: `200` with `{ ok: true, data }`

#### `POST /agents/weekly-report/revise`
Revises an existing weekly report draft.

Request body:

```json
{
  "account_email": "user@example.com",
  "current_subject": "current subject",
  "current_body": "current text body",
  "current_body_html": "<p>optional html</p>",
  "revision_instructions": "make it shorter",
  "recipient": "optional email"
}
```

Response: `200` with `{ ok: true, data }`

#### `POST /agents/weekly-report/send`
Sends the weekly report through Microsoft Graph using the backend-owned Outlook connection.

Request body:

```json
{
  "account_email": "user@example.com",
  "recipient": "manager@example.com",
  "subject": "Weekly report",
  "body": "plain text body",
  "body_html": "<p>optional html</p>",
  "confirm_send": true
}
```

Response: `200` with `{ ok: true, data }`

#### `POST /agents/weekly-report/save-draft`
Saves the weekly report into Outlook Drafts using the backend-owned Outlook connection.

Request body:

```json
{
  "account_email": "user@example.com",
  "recipient": "manager@example.com",
  "subject": "Weekly report",
  "body": "plain text body",
  "body_html": "<p>optional html</p>"
}
```

Response: `200` with `{ ok: true, data }`

### Rooms

`RoomsModule` is scaffolded, but there are currently no REST endpoints under `/rooms`.

### Logs

`LogsModule` exists as an internal boundary. It does not currently expose public REST endpoints.

## WebSocket Summary

Namespace:

```text
/realtime
```

Connect auth:
- send JWT access token during socket connection
- invalid or missing token disconnects the socket

Inbound events currently handled:
- `presence:join`
- `presence:update`
- `chat:send`
- `user:move`

Outbound events currently emitted:
- `presence:update`
- `chat:message`
- `chat:ack`
- `user:move`
- `agent:result`
- `error`

WebSocket envelope:

```json
{
  "event": "chat:message",
  "ok": true,
  "data": {}
}
```

Error envelope:

```json
{
  "event": "error",
  "ok": false,
  "error": {
    "code": "REALTIME_ERROR",
    "message": "Realtime request failed."
  }
}
```

## Implementation Notes

- There is no global URL prefix like `/api`; routes are mounted exactly as listed above.
- CORS is enabled globally.
- Request DTOs are currently TypeScript contracts; strict runtime validation decorators are not yet applied.
- `POST /auth/signup` is the current exception: it uses `class-validator` with a route-level `ValidationPipe`.
- Agent endpoints return job envelopes, not final agent output. Final output is stored in `job.responsePayload`.
