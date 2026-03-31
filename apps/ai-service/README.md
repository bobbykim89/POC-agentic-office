# ai-service

FastAPI app managed independently from the pnpm workspaces.

Current app structure:

- `app/main.py`: FastAPI routes and request/response models
- `app/services/linkedin_writer.py`: OpenAI-backed LinkedIn post generator
- `app/services/sprite_sheet_generator.py`: character sprite-sheet pipeline with validation and retries

There is no local `app/agents` implementation in the current version.

## Endpoints

- `GET /health`: service health check
- `POST /prompt`: placeholder prompt endpoint
- `POST /agents/linkedin-post`: sends short input to OpenAI and returns a concise silly LinkedIn-style post
- `POST /agents/sprite-sheet`: accepts either a description or an uploaded image, generates a sprite sheet, validates it, retries up to 3 times, and saves the final PNG locally

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

Extra env vars for the sprite pipeline:

```bash
OPENAI_VISION_MODEL=gpt-4.1-mini
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_QUALITY=medium
OPENAI_IMAGE_SIZE=1536x1024
OPENAI_IMAGE_STYLE=natural
SPRITE_OUTPUT_DIR=generated/sprites
```

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

## Test the sprite-sheet endpoint with a description

```bash
curl -X POST http://localhost:8001/agents/sprite-sheet \
  -F 'description=A white woman with fair skin, wavy blonde hair (shoulder-length), and blue eyes. She wears rectangular glasses, smiling, and has a slim build. She is dressed in plain beige dress pants and a beige sleeveless top. She holds a closed laptop in her LEFT hand.'
```

## Test the sprite-sheet endpoint with an image

```bash
curl -X POST http://localhost:8001/agents/sprite-sheet \
  -F "image=@apps/ai-service/test-assets/person-photo.png"
```

Run on the main project folder.

The generated sprite sheet is saved locally under `apps/ai-service/generated/sprites` by default. The response also includes a storage record placeholder for a future database integration.
