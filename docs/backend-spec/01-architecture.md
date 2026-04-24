# Backend Architecture

## Overview
NestJS backend acts as:
- System of record for app data
- Realtime gateway for WebSocket traffic
- API layer for the Vue client
- Bridge to FastAPI AI services

FastAPI service acts as:
- External HTTP-only AI execution layer
- Stateless compute boundary from NestJS perspective

## Responsibility Split
### NestJS owns
- Authentication
- Users and profiles
- Chat system (1:1 and group)
- Presence and visibility
- Coordinates and room state
- WebSocket communication
- Postgres persistence
- Agent request orchestration
- Logging and analytics

### FastAPI owns
- AI feature execution
- LinkedIn post generation
- Sprite sheet generation
- AI news generation
- Weekly report flows

## Integration Rule
- NestJS communicates with FastAPI only over HTTP.
- Do not infer websocket or internal module contracts from FastAPI internals.
- Treat FastAPI as an external service with its own response shapes.
