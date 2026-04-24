# Frontend AI API Integration Audit

This report audits the Vue 3 frontend for AI-agent-related API integrations and maps where requests are routed today.

## Executive Summary

- Frontend app scanned: `apps/client`
- AI-related frontend features found: `3`
- Distinct AI-related HTTP endpoints used by the frontend: `8`
- Direct FastAPI calls from frontend: `0`
- Calls already targeting NestJS/backend URL: `8`
- Shared frontend API client layer for AI features: `none`
- Important gap: the frontend calls backend façade routes under `/office/...`, but those routes were not found in the current NestJS source tree

## Shared API Layer Audit

### Current routing approach

- The frontend uses absolute URLs built from `import.meta.env.VITE_BACKEND_URL`
- Each feature performs `fetch(...)` directly inside its own component or game file
- Each feature defines its own local `fetchJson(...)` helper
- There is no shared API service, composable, or centralized HTTP client for AI features
- Vite dev server has no proxy configured in [vite.config.ts](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/vite.config.ts:1)

### Environment/config

Relevant frontend env declarations:

- [env.d.ts](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/env.d.ts:1)
  - `VITE_BACKEND_URL`
  - `VITE_AI_SERVICE_URL`

Findings:

- `VITE_BACKEND_URL` is actively used by AI-related features
- `VITE_AI_SERVICE_URL` is declared but not used anywhere in `apps/client/src`
- No `.env` files were found under `apps/client`

### Where requests should be centralized

Best centralization point in the frontend:

- create one shared API layer under `apps/client/src`, for example:
  - `src/services/apiClient.ts`
  - `src/services/agentApi.ts`

Why:

- all current AI requests duplicate `fetchJson(...)`
- base URL handling is repeated across files
- route migration from `/office/...` façade routes to canonical NestJS routes would otherwise require scattered edits

## Feature Mapping

### Feature: LinkedIn Post Generator

- Files:
  - [LinkedInPostTerminal.vue](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/components/LinkedInPostTerminal.vue:1)
  - [App.vue](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/App.vue:1)
- Endpoint: `POST /office/main-computers/linkedin-post`
- HTTP method: `POST`
- Current target: `NestJS backend`
- URL source: `VITE_BACKEND_URL`
- Current call style: direct `fetch(...)` inside component
- Notes:
  - No direct FastAPI call exists in the frontend for this feature
  - The frontend expects a backend façade route under `/office/main-computers/...`
  - That `/office/...` route was not found in the current backend source tree
- Needs migration to go through NestJS: `No, already uses backend URL`
- Needs frontend cleanup/realignment: `Yes`

### Feature: AI News / Newsstand

- Files:
  - [createOfficeGame.ts](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/game/createOfficeGame.ts:1)
- Endpoint: `GET /office/newsstand`
- HTTP method: `GET`
- Current target: `NestJS backend`
- URL source: `VITE_BACKEND_URL`
- Current call style: direct `fetch(...)` inside Phaser game file
- Notes:
  - The game layer requests AI news through a backend façade route, not directly from FastAPI
  - No direct `/agents/ai-news` call exists in the frontend
  - The `/office/newsstand` backend route was not found in the current NestJS source tree
- Needs migration to go through NestJS: `No, already uses backend URL`
- Needs frontend cleanup/realignment: `Yes`

### Feature: Weekly Report Agent

- Files:
  - [WeeklyReportTerminal.vue](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/components/WeeklyReportTerminal.vue:1)
  - [App.vue](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/App.vue:1)

Sub-routes used by this feature:

- `GET /office/main-computers/weekly-report/accounts`
- `GET /office/main-computers/weekly-report/history`
- `POST /office/main-computers/weekly-report/draft`
- `POST /office/main-computers/weekly-report/revise`
- `POST /office/main-computers/weekly-report/save-draft`
- `POST /office/main-computers/weekly-report/send`

Current target: `NestJS backend`

URL source:

- `VITE_BACKEND_URL`

Current call style:

- direct `fetch(...)` inside component

Notes:

- No direct FastAPI call exists in the frontend for weekly report flows
- The frontend relies on a backend façade namespace under `/office/main-computers/weekly-report/...`
- Those `/office/...` routes were not found in the current NestJS source tree
- The current backend agent bridge exposes canonical `/agents/weekly-report/...` routes instead, so there is a contract mismatch between frontend and backend code

Needs migration to go through NestJS:

- `No, already uses backend URL`

Needs frontend cleanup/realignment:

- `Yes`

### Feature: Sprite Generation

- Files: none found in frontend
- Endpoint: none found
- HTTP method: none
- Current target: none
- Notes:
  - No Vue component, composable, or service was found calling sprite generation routes
  - No frontend call to `/agents/sprite-sheet` was detected
- Needs migration: `No current frontend integration`

## Per-Endpoint Table

| Feature | File | Endpoint | Method | Current Target | Direct FastAPI? | Notes |
|---|---|---|---|---|---|---|
| LinkedIn Post Generator | `components/LinkedInPostTerminal.vue` | `/office/main-computers/linkedin-post` | `POST` | NestJS | No | Backend façade route not found in current Nest source |
| AI News / Newsstand | `game/createOfficeGame.ts` | `/office/newsstand` | `GET` | NestJS | No | Backend façade route not found in current Nest source |
| Weekly Report Accounts | `components/WeeklyReportTerminal.vue` | `/office/main-computers/weekly-report/accounts` | `GET` | NestJS | No | Frontend path differs from current backend `/agents/...` surface |
| Weekly Report History | `components/WeeklyReportTerminal.vue` | `/office/main-computers/weekly-report/history` | `GET` | NestJS | No | Frontend path differs from current backend `/agents/...` surface |
| Weekly Report Draft | `components/WeeklyReportTerminal.vue` | `/office/main-computers/weekly-report/draft` | `POST` | NestJS | No | Frontend path differs from current backend `/agents/...` surface |
| Weekly Report Revise | `components/WeeklyReportTerminal.vue` | `/office/main-computers/weekly-report/revise` | `POST` | NestJS | No | Frontend path differs from current backend `/agents/...` surface |
| Weekly Report Save Draft | `components/WeeklyReportTerminal.vue` | `/office/main-computers/weekly-report/save-draft` | `POST` | NestJS | No | Frontend path differs from current backend `/agents/...` surface |
| Weekly Report Send | `components/WeeklyReportTerminal.vue` | `/office/main-computers/weekly-report/send` | `POST` | NestJS | No | Frontend path differs from current backend `/agents/...` surface |

## Migration Impact

Even though the frontend is already targeting the backend URL, these places still need attention to make the architecture clean and stable.

### Group: LinkedIn Post

Files to revisit:

- [LinkedInPostTerminal.vue](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/components/LinkedInPostTerminal.vue:1)

Impact:

- move from per-component `fetchJson(...)` to shared API layer
- confirm whether `/office/main-computers/linkedin-post` remains the long-term backend route or should be aligned to `/agents/linkedin-post`

### Group: AI News

Files to revisit:

- [createOfficeGame.ts](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/game/createOfficeGame.ts:1)

Impact:

- move from game-local `fetchJson(...)` to shared API layer
- confirm whether `/office/newsstand` remains a backend façade route or should internally/externally align with `/agents/ai-news`

### Group: Weekly Report

Files to revisit:

- [WeeklyReportTerminal.vue](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/components/WeeklyReportTerminal.vue:1)

Impact:

- centralize six route calls into one shared frontend service
- align frontend route contract with the current NestJS backend route surface
- decide whether the frontend should keep the `/office/main-computers/weekly-report/...` façade or switch to `/agents/weekly-report/...`

### Group: Shared Frontend API Infrastructure

Files to revisit:

- [env.d.ts](/Users/skim585/Documents/projects/poc-agentic-office/apps/client/src/env.d.ts:1)
- feature files above

Impact:

- create one shared API client
- remove duplicated `fetchJson(...)`
- decide whether `VITE_AI_SERVICE_URL` should be removed or kept for non-production tooling, since it is currently unused

## Key Findings

1. The frontend does not currently call FastAPI directly for the AI features audited here.
2. All audited AI feature requests use `VITE_BACKEND_URL`, so they are already conceptually routed through NestJS.
3. The frontend is coupled to `/office/...` backend façade routes that do not appear in the current NestJS source tree.
4. The current backend agent bridge exposes `/agents/...` routes, so frontend/backend contract alignment is currently the bigger issue than FastAPI direct-call removal.
5. There is no shared API abstraction in the frontend, which will make future route alignment noisier unless centralized first.
