# AGENTS.md

## Repository expectations
- This repository is a turborepo monorepo.
- Backend is NestJS and acts as the bridge between the Vue client and the FastAPI AI service.
- FastAPI is an external HTTP-only service for agent features.
- Use Postgres with Drizzle ORM for backend persistence.
- Use Passport JWT for auth.
- Use Jest for tests.
- Prefer small, focused modules and avoid cross-cutting changes unless required by the task.
- Do not modify client or FastAPI code unless the task explicitly requires a contract change.
- Keep API responses consistent with the backend envelope documented in docs/backend-spec/08-api-conventions.md.
- Store durable state in Postgres; do not rely on transient websocket state for persistence.
- Run tests relevant to the changed module before finishing.
