# poc-agentic-office

Turborepo monorepo with:

- `apps/backend`: NestJS API
- `apps/ai-service`: FastAPI service
- `apps/client`: PhaserJS + Vue 3 + Vite client
- `packages/shared-types`: shared TypeScript interfaces and DTOs

## Quick start

### Node workspaces

```bash
pnpm install
pnpm dev
```

### Python service

```bash
cd apps/ai-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

## Suggested ports

- `apps/client`: `5173`
- `apps/backend`: `3000`
- `apps/ai-service`: `8001`

## starting this up

0. Start python env

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

1. Start up docker db

```bash
pnpm install
pnpm db:up
```

2. Create the tables for the db on postgreSQL

```bash
pnpm --filter @agentic-office/backend db:generate
pnpm --filter @agentic-office/backend db:migrate
```

3. Start everything together

```bash
pnpm dev
```

4. Open localhost http://localhost:5000
