# Persistence Strategy

## Database
- Postgres via Drizzle ORM

## Must Persist
- users
- conversations
- messages
- read states
- agent jobs
- agent logs
- spriteSheetUrl

## Optional History
- coordinate history
- agent execution logs

## Not Persisted
- typing events
- transient socket state

## FastAPI Persistence
- FastAPI uses file-based internal storage for its own implementation.
- NestJS must not rely on that storage as system of record.
