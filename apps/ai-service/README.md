# ai-service

FastAPI app managed independently from the pnpm workspaces.

Current app structure:

- `app/main.py`: FastAPI routes and request/response models
- `app/services/linkedin_writer.py`: OpenAI-backed LinkedIn post generator

There is no local `app/agents` implementation in the current version.

## Endpoints

- `GET /health`: service health check
- `POST /prompt`: placeholder prompt endpoint
- `POST /agents/linkedin-post`: sends short input to OpenAI and returns a concise silly LinkedIn-style post

Example request:

```json
{
  "text": "I fixed the office printer by unplugging it and plugging it back in"
}
```

The `text` field is limited to 200 characters.

## Environment

Create `apps/ai-service/.env`:

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5-mini
```

`OPENAI_MODEL` is optional and defaults to `gpt-5-mini`.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

## Test the LinkedIn endpoint

```bash
curl -X POST http://localhost:8001/agents/linkedin-post \
  -H "Content-Type: application/json" \
  -d '{"text":"I survived three meetings that should have been one email"}'
```
