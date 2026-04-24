# Microsoft OAuth Migration Plan

## Goal

Replace the current local-file Outlook connection flow with a product-ready architecture that:

- stores Microsoft account connections in Postgres
- makes the connection flow visible in the client
- ties connected accounts to authenticated app users
- removes credential ownership from `apps/ai-service`

## Current Problems

The current implementation works for local experimentation, but it has a few hard limits:

- Microsoft OAuth state and account credentials are stored in local JSON files under `apps/ai-service/generated/weekly_reports`
- the frontend does not expose a user-facing `Connect Outlook` action
- the AI service is acting as both task engine and credential store
- the design is not multi-user safe
- the design does not scale cleanly across multiple backend instances or environments

## Recommended Ownership

### Client

The client should:

- show current Outlook connection status for the authenticated app user
- expose a `Connect Outlook` action
- expose a `Disconnect Outlook` action later
- refresh account status after OAuth completes

The client should not:

- handle Microsoft access tokens directly
- store Microsoft refresh tokens
- talk to Microsoft OAuth endpoints directly

### Backend

The NestJS backend should own:

- Microsoft OAuth start endpoint
- Microsoft OAuth callback endpoint
- token exchange
- encrypted token persistence
- mapping Microsoft accounts to app users
- Graph access for weekly report history, draft context, send, and save-draft

The backend becomes the system of record for external integrations.

### AI Service

The AI service should focus on:

- weekly report drafting
- revision
- transformation of examples + user summary into generated content

The AI service should not permanently store:

- Microsoft OAuth states
- Microsoft access tokens
- Microsoft refresh tokens

## Proposed Architecture

### Flow

1. Authenticated user opens weekly report UI.
2. Client requests current Outlook connection status from backend.
3. If not connected, client shows `Connect Outlook`.
4. Client calls backend `GET /integrations/microsoft/oauth/start`.
5. Backend creates OAuth state, persists it in Postgres, and returns `authorizationUrl`.
6. Client redirects browser to Microsoft consent page.
7. Microsoft redirects to backend callback.
8. Backend validates state, exchanges code, fetches Microsoft profile, and stores encrypted tokens in Postgres.
9. Backend redirects back to client with a success status page or query flag.
10. Client reloads integration status and weekly report account data.
11. Weekly report features use the authenticated app user to resolve the linked Microsoft account.

## Recommended Backend Tables

These can be implemented as one or two tables depending on how normalized you want the first version to be.

### Option A: Single Table

`external_accounts`

- `id` UUID PK
- `user_id` UUID FK -> users.id
- `provider` text, fixed to `microsoft`
- `provider_account_id` text nullable
- `provider_account_email` text not null
- `access_token_encrypted` text not null
- `refresh_token_encrypted` text nullable
- `token_expires_at` timestamptz nullable
- `scopes` jsonb not null default `[]`
- `connected_at` timestamptz not null
- `last_used_at` timestamptz nullable
- `created_at` timestamptz not null
- `updated_at` timestamptz not null

Indexes:

- unique `(provider, user_id, provider_account_email)`
- index on `(user_id, provider)`

### Option B: Two Tables

`external_accounts`

- account identity, linkage, profile metadata

`external_account_tokens`

- encrypted token material and expiry

Option A is simpler for this repo right now.

### OAuth State Table

`oauth_states`

- `id` UUID PK
- `provider` text not null
- `user_id` UUID FK -> users.id
- `state` text unique not null
- `redirect_to` text nullable
- `expires_at` timestamptz not null
- `created_at` timestamptz not null

This avoids local-file OAuth state handling.

## Recommended Backend API

### Integration Endpoints

Add backend-owned routes such as:

- `GET /integrations/microsoft/accounts`
- `GET /integrations/microsoft/oauth/start`
- `GET /integrations/microsoft/oauth/callback`
- `DELETE /integrations/microsoft/accounts/:accountId`

Behavior:

- all routes are authenticated with app JWT auth
- accounts returned are scoped to the current app user
- callback resolves to the same app user who initiated the flow

### Weekly Report Endpoints

The weekly report endpoints should stop depending on arbitrary `account_email` input from the client as the primary identity.

Recommended direction:

- backend resolves the connected account from current authenticated user
- client sends either no account selector or a backend-owned account id

Safer patterns:

- `GET /agents/weekly-report/history?accountId=<uuid>`
- or `GET /agents/weekly-report/history` when only one connected account is supported

This avoids trusting raw email from the client as the account identity.

## Recommended Service Boundary

Two good options:

### Option 1: Backend Owns Microsoft Graph, AI Service Owns Drafting

Backend:

- fetches Outlook message history from Microsoft Graph
- loads current user’s connected account
- passes normalized examples and summary to AI service

AI service:

- drafts and revises report content only

This is the cleanest long-term separation.

### Option 2: Backend Owns Token Store, AI Service Still Calls Graph

Backend:

- stores and refreshes tokens
- passes a short-lived access token to AI service when needed

AI service:

- calls Graph and drafts content

This is workable, but it keeps Graph responsibility split between services.

Recommended choice: Option 1.

## Client UX Plan

### Weekly Report Terminal

When the user opens the terminal:

- load connected Outlook accounts from backend
- if none exist, show:
  - explanation
  - `Connect Outlook` button
- after successful connection, reload account state automatically

### OAuth UX

Recommended behavior:

- clicking `Connect Outlook` opens backend OAuth start
- after callback, backend redirects to a small client route such as:
  - `/integrations/microsoft/callback?status=success`
- client route closes modal or returns user to weekly report flow
- terminal reloads accounts automatically

## Security Guidance

- encrypt Microsoft access and refresh tokens before storing them in Postgres
- never expose Microsoft refresh tokens to the frontend
- scope account access by authenticated app user
- rotate refreshed access tokens in storage
- expire OAuth state records aggressively
- audit connect/disconnect/use events in `logs`

## Migration Plan

### Phase 1

- add backend tables for `external_accounts` and `oauth_states`
- add backend Microsoft OAuth start/callback endpoints
- keep AI service weekly report generation endpoints as-is for drafting logic

### Phase 2

- add client `Connect Outlook` flow
- update weekly report UI to use backend-owned integration endpoints

### Phase 3

- move Microsoft Graph history/send/save-draft logic from AI service into backend
- keep AI service for text generation only

### Phase 4

- remove local JSON credential storage from AI service
- remove Microsoft OAuth ownership from AI service

## Recommended First Implementation Scope

If we want the fastest path to a much better architecture without over-refactoring at once:

1. Add backend OAuth start/callback + DB persistence
2. Add client `Connect Outlook` UX
3. Keep AI service for drafting only
4. Move Graph read/send/save operations into backend next

That gives you:

- a user-friendly connection flow
- durable multi-user storage
- a cleaner service boundary
- less risk than trying to rewrite everything in one pass
