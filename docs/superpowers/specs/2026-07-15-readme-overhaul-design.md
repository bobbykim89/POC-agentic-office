# README Overhaul — Design

**Date:** 2026-07-15
**Status:** Approved, not yet implemented

## Problem

The README (65 lines) documents how to boot the stack but never says what the stack is. A reader can run `pnpm dev` and have no idea they have just started a gamified office where AI agents are physical destinations. Every feature that makes the project interesting — the walkable Phaser office, the four agent terminals, realtime chat, the proactive mini-me assistant — is absent from the front page.

The README is also incorrect in four ways, each traceable to nobody executing it end to end:

1. **Wrong port.** The "Suggested ports" section advertises the client on `5173`. `apps/client/vite.config.ts:14` pins it to `5000`, which is what step 4 tells the reader to open. Two sections of one README disagree.
2. **Step 0 cannot work.** It runs `pip install -r requirements.txt` from the repo root; `requirements.txt` lives in `apps/ai-service/`. The earlier "Python service" section `cd`s first, the numbered steps do not.
3. **`.env` setup is never mentioned.** `apps/backend/.env.example` and `apps/ai-service/.env.example` both exist, and the backend `dev` script runs `dotenv -e .env`. A fresh clone following the README exactly fails at `pnpm dev`.
4. **Two competing setup sections.** "Quick start" and "starting this up" contradict each other.

A fifth problem is implied rather than stated: the README suggests step 4 leaves you with a working app. Every AI feature requires credentials the README never names, so it does not.

## Decisions

Settled during brainstorming; recorded so implementation does not relitigate them.

| Decision | Choice | Rationale |
|---|---|---|
| Audience | Both showcase and contributor, **split** across two docs | Keeps the front page tight; deep readers get a real document instead of a long scroll |
| Visuals | **Mermaid only**, no screenshots | Renders natively on GitHub, never goes stale in an `/assets` folder. Screenshot slots left as HTML comments so a GIF can be added later without a rewrite |
| Forward-looking content | **None** | No roadmap, no "how to add an agent" walkthrough. Document what exists. Extensibility is implied by the architecture, not promised |
| Tone | **Straight and technical** | The app performs the joke; the README does not need to |
| Existing docs | **Untouched** | Approach A. Dated artifacts are routed around by curated linking, not edited or moved |

### Rejected alternatives

- **Docs triage** (status headers or `docs/archive/` for the dated artifacts) — the honest fix, but scope creep on a README task. Curated linking gets most of the benefit: a reader following the README never reaches the stale docs.
- **One heavy README, no split** — contradicts the chosen split and buries the quick start under architecture.

## The docs/ hazard

`docs/` mixes two kinds of document. Implementation must link only the first kind.

**Durable reference — safe to link:**

- `docs/backend-api-reference.md` (810 lines)
- `docs/ai-service-implementation-guide.md`
- `docs/backend-spec/` (10 files)
- `docs/frontend-auth/` (5 files)

**Dated artifacts — must not be linked:**

- `docs/frontend-backend-api-mismatches.md` — bug audit; still contains absolute paths from a `/Users/skim585/…` machine
- `docs/microsoft-oauth-migration-plan.md` — a plan with no commits behind it
- `docs/chat-room-implementation.md` — build plan for a feature now built
- `docs/frontend-agent-api-audit.md` — point-in-time audit

**Not linked, but not an artifact either:** `docs/sprite-generation-flow.md` is a durable single-feature flow doc. It is simply out of scope for a curated top-level map, which lists system-wide references only. Not linked from either deliverable.

## Verified feature inventory

The office defines roughly 18 interaction zones in `apps/client/src/game/createOfficeGame.ts`. Only four are agent surfaces; the rest are flavor (coffee maker, vending machine, Phoenix skyline, x-lab). The README table must show only these four:

| Zone id | Where | Agent | Endpoint |
|---|---|---|---|
| `newstand-panel` | Newsstand | AI news | `GET /agents/ai-news` |
| `main-computers-top` | Main computers (top) | LinkedIn writer | `POST /agents/linkedin-post` |
| `main-computers-bottom` | Main computers (bottom) | 515 drafter | `POST /agents/weekly-report/*` |
| `video-room` | Video room | Sprite studio | `POST /agents/sprite-sheet` |

Two features are not zones and must be described separately:

- **Realtime chat** — 1:1 and group, presence, movement. Four gateway events: `presence:join`, `presence:update`, `chat:send`, `user:move`.
- **Avatar assistant (mini-me)** — a backend detector (`proactive-515.detector.ts`) that reads state and writes notifications without a request. Surfaced via `GET /avatar-assistant/message`.

## Deliverable 1 — `README.md` (rewrite)

Target 120–150 lines, in order:

1. **Title + one-liner.** Named honestly as a proof-of-concept.
2. **What this is.** One paragraph: an office you walk around as a sprite; the productivity tools are AI agents you physically approach.
3. **Screenshot slot.** HTML comment marking where a GIF goes.
4. **The office.** The four-row agent table above, plus a short note on realtime chat and the mini-me assistant.
5. **Architecture at a glance.** One mermaid diagram (Vue/Phaser → NestJS → FastAPI, Postgres off NestJS), three sentences on the responsibility split, link to `docs/architecture.md`.
6. **Tech stack.** Compact list.
7. **Quick start.** One section, corrected — see below.
8. **Ports.** Client `5000`, backend `3000`, ai-service `8001`.
9. **Project layout.** Four workspaces, one line each.
10. **Docs.** Curated links to durable docs only.

### Quick start requirements

Replaces both existing setup sections. Must:

- List prerequisites (Node, pnpm 10.6.5, Python, Docker).
- Include `cp .env.example .env` for **both** `apps/backend` and `apps/ai-service`, with the required variables named.
- `cd apps/ai-service` before the venv and `pip install` steps.
- Order: env → `pnpm install` → `pnpm db:up` → `db:generate` → `db:migrate` → venv → `pnpm dev` → open `:5000`.
- State explicitly that `pnpm dev` yields a **walkable office**, and that each agent additionally requires its own credentials, with env vars named per agent:
  - LinkedIn writer, AI news, sprite studio → `OPENAI_API_KEY`
  - Sprite studio (hosted assets) → Cloudinary credentials
  - 515 drafter → Microsoft Graph credentials

## Deliverable 2 — `docs/architecture.md` (new)

Target 200–250 lines. Fills a real gap: `docs/backend-spec/01-architecture.md` covers the NestJS/FastAPI split but says nothing about the client, and nothing ties the four workspaces together.

1. **Scope note.** Describes what is built today; defers to the specs for depth. This sentence is what prevents it becoming a fourth competing source of truth.
2. **System overview.** Mermaid diagram — client, backend, ai-service, Postgres, **and** the three external dependencies (OpenAI, Microsoft Graph, Cloudinary), which is where the secrets and failure modes live.
3. **Responsibility split.** Compressed from the backend spec and linked, not restated.
4. **Agent request flow.** The core section. Mermaid *sequence* diagram: press `E` → terminal component → `POST /agents/…` → agent-bridge controller → fastapi-client → FastAPI → OpenAI → response normalized into the envelope → terminal. Then the async variant: AgentJob row, WebSocket notify on completion. Gets the most space — it is the one flow that explains the system.
5. **Response envelope.** The `{ ok, data }` shape and why every response wears it.
6. **Auth.** Passport JWT: where the token is issued, how the gateway authenticates.
7. **Realtime.** The four implemented events, and the rule that durable state goes to Postgres rather than socket memory.
8. **Persistence.** The 14 tables grouped by concern (identity, chat, world state, agents, integrations), not listed flat.
9. **Avatar assistant.** Its own short section: the one component that acts without a request. A detector reads state and writes notifications. Described as what it is, not pitched as an extension point.
10. **Read next.** Curated map — durable docs only, one line each on what it covers and when you would want it.

## Verification

The current README is broken because nobody executed it. The new one gets executed before it ships.

**Must be verified by running:**

- `pnpm install`
- `pnpm db:up` brings up Postgres
- `pnpm --filter @agentic-office/backend db:generate` and `db:migrate` create tables
- `pnpm dev` boots all three services
- Client answers on `:5000`, backend on `:3000`, ai-service `/health` on `:8001`
- The venv steps work with the `cd` restored
- Every relative link resolves
- Both mermaid diagrams parse

**Cannot be verified** (requires secrets not available): any live agent call — LinkedIn writer, 515 flow, sprite studio. These need `OPENAI_API_KEY`, Microsoft Graph, and Cloudinary credentials respectively.

**Rule:** a claim that survives none of the above comes out of the README rather than being hedged into vagueness. Unverified paths are reported as unverified, not asserted.

## Out of scope

- Editing, moving, or annotating any existing doc
- Screenshots or GIFs (slots only)
- Roadmap or extension walkthrough
- Fixing the absolute paths in `docs/frontend-backend-api-mismatches.md`
- Any code change outside documentation
