# AI Service Implementation Guide

## Scope
This document describes the current `apps/ai-service` implementation as the source of truth for integration work. It is intentionally limited to what the code actually implements today.

## Architecture Boundaries
- `app/main.py` is the HTTP boundary. It owns FastAPI route registration, request validation, response shaping, and HTTP status mapping.
- `app/services/*` is the orchestration layer. Service modules perform external API calls, prompt construction, validation, retries, and file persistence.
- There is no separate repository layer, queue worker, websocket server, or internal agent runtime in this service.
- There is no shared domain envelope across endpoints beyond each route's declared Pydantic response model.
- The service is synchronous from the caller's perspective except for multipart file upload handling in `POST /agents/sprite-sheet`.

## Auth Rules
- `GET /health`, `POST /prompt`, `POST /agents/linkedin-post`, `POST /agents/sprite-sheet`, and `GET /agents/ai-news` have no service-level auth.
- The active product flow now expects NestJS backend auth and backend-owned Microsoft connections.
- Legacy AI-service Microsoft OAuth/account routes still exist in code, but they are no longer the intended source of truth for the app.
- Active weekly report usage for the product should come from backend-to-AI-service calls, not direct browser-to-AI-service auth/account flows.
- Microsoft Graph scopes are fixed:
  - `offline_access`
  - `openid`
  - `profile`
  - `User.Read`
  - `Mail.Read`
  - `Mail.ReadWrite`
  - `Mail.Send`
- Send is gated by explicit user confirmation when the legacy send endpoint is used:
  - `POST /agents/weekly-report/send` must receive `confirm_send: true`
  - Otherwise the service rejects with `400`

## Chat Model
- The service is not a general chat service. It exposes task-specific agent-like endpoints only.
- OpenAI model selection is per feature via env vars:
  - LinkedIn writer: `OPENAI_MODEL`, default `gpt-5-mini`
  - AI news: `OPENAI_NEWS_MODEL`, default `gpt-5-mini`
  - Weekly report drafting/revision: `OPENAI_515_MODEL`, default `gpt-5-mini`
  - Sprite vision analysis: `OPENAI_VISION_MODEL`, default `gpt-4.1-mini`
  - Sprite image generation: `OPENAI_IMAGE_MODEL`, default `gpt-image-1`
- LinkedIn and AI news use the Responses API with fixed instructions and short outputs.
- Weekly report draft/revise expects JSON-only model output with keys:
  - `subject`
  - `body`
  - `body_html`
- Sprite generation uses a two-step model flow:
  - vision model to extract/validate
  - image model to generate

## WebSocket Events
- None implemented.
- There are no `WebSocket` routes, event names, streaming contracts, or socket auth rules in `apps/ai-service`.
- Integrations should treat this service as HTTP-only until websocket support is added explicitly.

## Agent Bridge Contracts
- None implemented as a runtime bridge.
- The closest current contract is plain HTTP between the backend and these task endpoints:
  - `POST /agents/linkedin-post`
  - `POST /agents/sprite-sheet`
  - `GET /agents/ai-news`
  - `POST /agents/weekly-report/draft-from-context`
  - `POST /agents/weekly-report/revise`
- Legacy weekly report endpoints for Microsoft auth/account/history/send/save-draft still exist, but the backend-owned flow should be treated as authoritative for the application.
- Service modules are internal implementation details and must not be treated as cross-service contracts.
- If a future agent bridge is added, define it separately instead of inferring one from `app/services`.

## Response Envelope
- Success responses are route-specific JSON objects defined in `app/main.py`.
- There is no global success envelope like `{ ok, data, error }`.
- Error responses use FastAPI `HTTPException` and therefore follow the default error shape:
  - `{"detail": "..."}`
- Status mapping rule:
  - `RuntimeError` raised by service code becomes a handled client or configuration failure
  - unexpected exceptions become upstream/integration failures
- Route-level status behavior:
  - `POST /agents/linkedin-post`: `500` on missing config/runtime issue, `502` on OpenAI failure
  - `POST /agents/sprite-sheet`: `400` for invalid input, `500` on runtime issue, `502` on pipeline failure
  - `GET /agents/ai-news`: `500` on runtime/config issue, `502` on feed or OpenAI failure
  - `POST /agents/weekly-report/draft-from-context`: `400` for business-rule failures, `502` otherwise
  - `POST /agents/weekly-report/revise`: `400` for business-rule failures, `502` otherwise
  - Legacy weekly report auth/history/draft/send/save-draft endpoints retain their previous status behavior
- Weekly report message objects always use this normalized shape:
  - `message_id`
  - `thread_id`
  - `subject`
  - `sent_at`
  - `to`
  - `cc`
  - `snippet`
  - `body_text`
  - `body_html`

## Data Persistence Rules
- Persistence is file-based only in the current implementation.
- No relational database writes are implemented by this service.
- Sprite output:
  - Final PNG is always written under `apps/ai-service/generated/sprites` unless `SPRITE_OUTPUT_DIR` overrides it.
  - Response includes both `relative_image_path` and `absolute_image_path`.
  - `storage_record.db_persisted` is always `false`.
  - Optional Cloudinary upload is additive only; local file storage still occurs first.
- Legacy weekly report OAuth state and Microsoft account credentials are still file-based when the old AI-service-owned flow is used:
  - OAuth state: `apps/ai-service/generated/weekly_reports/microsoft_oauth_states.json`
  - account credentials: `apps/ai-service/generated/weekly_reports/microsoft_accounts.json`
  - These files should be treated as legacy compatibility storage, not the active product source of truth.
- Weekly report drafts and sent mail are not persisted locally by this service.
- In the active product flow, Microsoft 365 draft/send persistence now happens from the backend, not this service.
- This service’s active weekly report responsibility is drafting/revision logic and draft generation from caller-provided context.
- JSON file load/write rules:
  - Missing files are treated as empty stores
  - Invalid JSON is treated as an empty store
  - Writes overwrite the whole JSON file with sorted, indented JSON

## Implementation Guardrails
- Keep the HTTP boundary in `app/main.py` thin.
- Put new external API logic in `app/services`, not in route handlers.
- Do not add websocket or agent-bridge assumptions unless new code introduces them.
- Prefer backend-owned Microsoft account and Graph access for the application instead of expanding the legacy AI-service credential store.
- If a shared response envelope is desired later, introduce it intentionally across all routes rather than mixing styles.
