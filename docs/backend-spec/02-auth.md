# Authentication Specification

## Method
- JWT Bearer Authentication

## Header
Authorization: Bearer <token>

## User Model
- id (uuid)
- username
- email
- passwordHash
- spriteSheetUrl (nullable)
- createdAt
- updatedAt

## Auth Flow
1. User logs in with email + password.
2. Backend validates credentials.
3. Backend returns access token and refresh token.

## Socket Auth
- JWT is required on WebSocket connection.
- Invalid token rejects the connection.

## Notes
- Refresh-token support is recommended for logout and revocation.
- Sessions may be modeled explicitly if needed later.
