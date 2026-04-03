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
- If Cloudinary credentials are configured, generated sprite sheets are also uploaded to Cloudinary and the response includes hosted asset metadata
- `GET /agents/ai-news`: fetches a recent AI-related news item, picks one at random, and summarizes it in plain language
- `GET /agents/weekly-report/google/auth/start`: starts Google OAuth so a user can connect Gmail
- `GET /agents/weekly-report/google/auth/callback`: stores the Gmail OAuth tokens after consent
- `GET /agents/weekly-report/google/accounts`: lists connected Gmail accounts
- `GET /agents/weekly-report/history`: fetches recent sent 515-style emails
- `POST /agents/weekly-report/draft`: drafts a 515 email from a rough weekly summary and prior examples
- `POST /agents/weekly-report/revise`: revises a draft based on user feedback
- `POST /agents/weekly-report/send`: sends the approved 515 email through Gmail

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
OPENAI_NEWS_MODEL=gpt-5-mini
AI_NEWS_FEED_PROVIDER=google
AI_NEWS_RANDOM_POOL_SIZE=20
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
FINAL_SPRITE_HEIGHT=256
AI_NEWS_QUERY=AI OR artificial intelligence OR OpenAI OR Anthropic OR Gemini
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
CLOUDINARY_SPRITE_FOLDER=agentic-office/sprites
OPENAI_515_MODEL=gpt-5-mini
GOOGLE_OAUTH_CLIENT_ID=your_google_oauth_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8001/agents/weekly-report/google/auth/callback
WEEKLY_REPORT_GMAIL_QUERY=in:sent subject:(515 report) newer_than:30d
WEEKLY_REPORT_DEFAULT_TO=
```

`FINAL_SPRITE_HEIGHT` defaults to `256`. The pipeline rescales the final PNG to that height while preserving aspect ratio.
If the `CLOUDINARY_*` vars are set, the sprite response includes `storage_record.cloudinary.secure_url`.
The weekly report agent stores connected Gmail account tokens locally under `apps/ai-service/generated/weekly_reports` in this first version.

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

## Test the AI news endpoint

```bash
curl http://localhost:8001/agents/ai-news
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

The generated sprite sheet is saved locally under `apps/ai-service/generated/sprites` by default. When Cloudinary is configured, the same response also includes hosted asset metadata and a URL you can use directly in the frontend.

## Test the weekly report Gmail flow

1. Create a Google OAuth web app and add `http://localhost:8001/agents/weekly-report/google/auth/callback` as an authorized redirect URI.
2. Put `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, and `OPENAI_API_KEY` in `apps/ai-service/.env`.
3. Start the service:

```bash
uvicorn app.main:app --reload --port 8001
```

4. Start auth and open the returned `authorization_url` in a browser:

```bash
curl http://localhost:8001/agents/weekly-report/google/auth/start
```

5. After consent, the callback stores the Gmail account locally. You can verify connected accounts:

```bash
curl http://localhost:8001/agents/weekly-report/google/accounts
```

6. Fetch recent 515 examples:

```bash
curl "http://localhost:8001/agents/weekly-report/history?account_email=your.asu@asu.edu"
```

7. Draft a new 515 from a rough summary:

```bash
curl -X POST http://localhost:8001/agents/weekly-report/draft \
  -H "Content-Type: application/json" \
  -d '{
    "account_email":"your.asu@asu.edu",
    "weekly_summary":"I wrapped up the sprite generator fixes, tested Cloudinary uploads, and started shaping the 515 workflow. Next week I want to keep moving on the Gmail integration and clean up a few rough edges."
  }'
```

8. Revise the draft if needed:

```bash
curl -X POST http://localhost:8001/agents/weekly-report/revise \
  -H "Content-Type: application/json" \
  -d '{
    "account_email":"your.asu@asu.edu",
    "current_subject":"515 Report",
    "current_body":"Draft body here",
    "revision_instructions":"Make this a little more concise and slightly more formal."
  }'
```

9. Send only after approval:

```bash
curl -X POST http://localhost:8001/agents/weekly-report/send \
  -H "Content-Type: application/json" \
  -d '{
    "account_email":"your.asu@asu.edu",
    "recipient":"manager@asu.edu",
    "subject":"515 Report",
    "body":"Final approved draft here",
    "confirm_send":true
  }'
```
