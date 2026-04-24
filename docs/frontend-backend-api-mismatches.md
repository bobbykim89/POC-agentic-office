# Frontend and Backend API Mismatches

This document records the API contract mismatches found between the current Vue client and the current NestJS backend.

Source of truth used for backend routing:
- [apps/backend/src/modules/auth/controllers/auth.controller.ts](/Users/skim585/Documents/projects/poc-agentic-office/apps/backend/src/modules/auth/controllers/auth.controller.ts:1)
- [apps/backend/src/modules/agent-bridge/controllers/agent-bridge.controller.ts](/Users/skim585/Documents/projects/poc-agentic-office/apps/backend/src/modules/agent-bridge/controllers/agent-bridge.controller.ts:1)

Source of truth used for frontend usage:
- [apps/client/src/stores/auth.ts](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/stores/auth.ts:1)
- [apps/client/src/components/LinkedInPostTerminal.vue](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/components/LinkedInPostTerminal.vue:1)
- [apps/client/src/components/WeeklyReportTerminal.vue](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/components/WeeklyReportTerminal.vue:1)
- [apps/client/src/game/createOfficeGame.ts](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/game/createOfficeGame.ts:1)

## Summary

- Frontend endpoints checked: `11` REST + `1` websocket
- Missing or renamed backend routes: `7`
- Request contract mismatch: `1`
- Fully aligned routes: `4`

## Route Mismatches Fixed On Client

### LinkedIn Post

- Old frontend route: `POST /office/main-computers/linkedin-post`
- Current backend route: `POST /agents/linkedin-post`
- Request body: unchanged
  - `{ text: string }`

### AI News

- Old frontend route: `GET /office/newsstand`
- Current backend route: `GET /agents/ai-news`
- Request body: none

### Weekly Report Accounts

- Old frontend route: `GET /office/main-computers/weekly-report/accounts`
- Current backend route: `GET /agents/weekly-report/microsoft/accounts`
- Request body: none

### Weekly Report History

- Old frontend route: `GET /office/main-computers/weekly-report/history`
- Current backend route: `GET /agents/weekly-report/history`
- Query parameters: unchanged
  - `account_email` required
  - `query` optional
  - `max_results` optional

### Weekly Report Draft

- Old frontend route: `POST /office/main-computers/weekly-report/draft`
- Current backend route: `POST /agents/weekly-report/draft`
- Request body: compatible
  - Frontend sends `{ account_email, weekly_summary }`
  - Backend accepts that and also supports optional extra fields

### Weekly Report Revise

- Old frontend route: `POST /office/main-computers/weekly-report/revise`
- Current backend route: `POST /agents/weekly-report/revise`
- Request body: unchanged
  - `account_email`
  - `current_subject`
  - `current_body`
  - `current_body_html`
  - `revision_instructions`
  - `recipient`

### Weekly Report Save Draft

- Old frontend route: `POST /office/main-computers/weekly-report/save-draft`
- Current backend route: `POST /agents/weekly-report/save-draft`
- Request body: unchanged
  - `account_email`
  - `recipient`
  - `subject`
  - `body`
  - `body_html`

### Weekly Report Send

- Old frontend route: `POST /office/main-computers/weekly-report/send`
- Current backend route: `POST /agents/weekly-report/send`
- Request body: unchanged
  - `account_email`
  - `recipient`
  - `subject`
  - `body`
  - `body_html`
  - `confirm_send: true`

## Auth Contract Alignment

### Refresh Token Flow

- Frontend currently calls: `POST /auth/refresh`
- Frontend request body now: `{ refreshToken: string }`
- Backend currently expects: `{ refreshToken: string }`

Current frontend behavior:
- `accessToken` remains memory-only
- `refreshToken` is stored in `sessionStorage`
- on app initialization, the client uses the stored refresh token to obtain a new access token and then fetches `/auth/me`

Security note:
- This is an explicit token-based refresh flow, not an `httpOnly` cookie flow.
- It is operationally simpler for separate frontend/backend domains, but the refresh token is accessible to client-side JavaScript.

## Additional Client Compatibility Fix

The client code now accepts both environment variable names for backend URL:

- `VITE_BACKEND_URL`
- `VITE_BACKEND_API_URL`

This avoids accidental breakage from the existing `.env` naming mismatch.
