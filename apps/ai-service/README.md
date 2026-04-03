# ai-service

FastAPI app managed independently from the pnpm workspaces.

Current app structure:

- `app/main.py`: FastAPI routes and request/response models
- `app/services/linkedin_writer.py`: OpenAI-backed LinkedIn post generator
- `app/services/sprite_sheet_generator.py`: character sprite-sheet pipeline with validation and retries
- `app/services/weekly_report_agent.py`: Outlook/Microsoft Graph-backed 515 drafting, revision, draft-save, and send flow

There is no local `app/agents` implementation in the current version.

## Endpoints

- `GET /health`: service health check
- `POST /prompt`: placeholder prompt endpoint
- `POST /agents/linkedin-post`: sends short input to OpenAI and returns a concise silly LinkedIn-style post
- `POST /agents/sprite-sheet`: accepts either a description or an uploaded image, generates a sprite sheet, validates it, retries up to 3 times, and saves the final PNG locally
- If Cloudinary credentials are configured, generated sprite sheets are also uploaded to Cloudinary and the response includes hosted asset metadata
- `GET /agents/ai-news`: fetches a recent AI-related news item, picks one at random, and summarizes it in plain language
- `GET /agents/weekly-report/microsoft/auth/start`: starts Microsoft OAuth so a user can connect Outlook/Microsoft 365 mail
- `GET /agents/weekly-report/microsoft/auth/callback`: stores the Microsoft OAuth tokens after consent
- `GET /agents/weekly-report/microsoft/accounts`: lists connected Outlook accounts
- `GET /agents/weekly-report/history`: fetches recent sent 515-style emails
- `POST /agents/weekly-report/draft`: drafts a 515 email from a rough weekly summary and prior examples
- `POST /agents/weekly-report/revise`: revises a draft based on user feedback
- `POST /agents/weekly-report/save-draft`: saves the current 515 draft to Outlook Drafts without sending it
- `POST /agents/weekly-report/send`: sends the approved 515 email through Microsoft Graph

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
MICROSOFT_CLIENT_ID=your_microsoft_app_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_app_client_secret
MICROSOFT_TENANT_ID=organizations
MICROSOFT_REDIRECT_URI=http://localhost:8001/agents/weekly-report/microsoft/auth/callback
WEEKLY_REPORT_SUBJECT_QUERY=515 report
WEEKLY_REPORT_LOOKBACK_DAYS=30
WEEKLY_REPORT_TIMEZONE=America/Phoenix
WEEKLY_REPORT_DEFAULT_TO=
```

`FINAL_SPRITE_HEIGHT` defaults to `256`. The pipeline rescales the final PNG to that height while preserving aspect ratio.
If the `CLOUDINARY_*` vars are set, the sprite response includes `storage_record.cloudinary.secure_url`.
The weekly report agent stores connected Microsoft account tokens locally under `apps/ai-service/generated/weekly_reports` in this first version.

Microsoft/Outlook env var notes:

- `MICROSOFT_CLIENT_ID`: the Application (client) ID from your Microsoft Entra app registration
- `MICROSOFT_CLIENT_SECRET`: the client secret value from `Certificates & secrets`
- `MICROSOFT_TENANT_ID`: the Directory (tenant) ID for a single-tenant app, or `organizations` for a broader org-based login
- `MICROSOFT_REDIRECT_URI`: the web redirect URI configured on the Entra app, for example `http://localhost:8001/agents/weekly-report/microsoft/auth/callback`

Weekly report env var notes:

- `WEEKLY_REPORT_SUBJECT_QUERY`: simple subject-term matching for prior 515 emails
- `WEEKLY_REPORT_LOOKBACK_DAYS`: how far back to search Sent Items
- `WEEKLY_REPORT_TIMEZONE`: timezone used when rolling the subject line to today's date
- `WEEKLY_REPORT_DEFAULT_TO`: fallback recipient if prior examples do not contain one

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

## Test the weekly report Outlook flow

1. Create a Microsoft Entra app registration and add `http://localhost:8001/agents/weekly-report/microsoft/auth/callback` as a redirect URI.
2. Grant delegated Microsoft Graph permissions for `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `User.Read`, and `offline_access`.
3. Put `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`, and `OPENAI_API_KEY` in `apps/ai-service/.env`.
4. Start the service:

```bash
uvicorn app.main:app --reload --port 8001
```

5. Start auth and open the returned `authorization_url` in a browser:

```bash
curl http://localhost:8001/agents/weekly-report/microsoft/auth/start
```

6. After consent, the callback stores the Outlook account locally. You can verify connected accounts:

```bash
curl http://localhost:8001/agents/weekly-report/microsoft/accounts
```

7. Fetch recent 515 examples:

```bash
curl "http://localhost:8001/agents/weekly-report/history?account_email=your.asu@asu.edu"
```

8. Draft a new 515 from a rough summary:

```bash
curl -X POST http://localhost:8001/agents/weekly-report/draft \
  -H "Content-Type: application/json" \
  -d '{
    "account_email":"your.asu@asu.edu",
    "weekly_summary":"I wrapped up the sprite generator fixes, tested Cloudinary uploads, and started shaping the 515 workflow. Next week I want to keep moving on the Outlook integration and clean up a few rough edges."
  }'
```

9. Revise the draft if needed:

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

10. Save to Outlook Drafts if you do not want to send yet:

```bash
curl -X POST http://localhost:8001/agents/weekly-report/save-draft \
  -H "Content-Type: application/json" \
  -d '{
    "account_email":"your.asu@asu.edu",
    "recipient":"manager@asu.edu",
    "subject":"515 Report",
    "body":"Final draft you want to keep in Outlook drafts"
  }'
```

11. Send only after approval:

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

## Weekly Report Workflow

The intended backend workflow for the 515 generator is:

1. Connect Outlook through Microsoft OAuth
2. Fetch recent sent 515 emails from Sent Items
3. Draft a new 515 from a rough weekly summary
4. Optionally revise the draft one or more times
5. Save the final version to Outlook Drafts
6. Send only when the user explicitly confirms

The weekly report APIs return both:

- `body`: plain text for quick reading and editing
- `body_html`: rich HTML for Outlook-friendly formatting

That means the draft-save and send endpoints can preserve section headers, bullets, and spacing instead of flattening the email into plain text.

### Practical local testing loop

If you save a draft response into a local file such as `apps/ai-service/test-assets/test.json`, you can reuse it during manual testing:

Save the current response as an Outlook draft:

```bash
curl -X POST http://localhost:8001/agents/weekly-report/save-draft \
  -H "Content-Type: application/json" \
  --data-binary "$(jq '{account_email, recipient, subject, body, body_html}' apps/ai-service/test-assets/test.json)"
```

Revise an existing local draft file and overwrite it with the new response:

```bash
jq --slurpfile draft apps/ai-service/test-assets/test.json -n \
  --arg instructions "Make this a little more concise while keeping the same structure and tone." \
  '{
    account_email: $draft[0].account_email,
    current_subject: $draft[0].subject,
    current_body: $draft[0].body,
    current_body_html: $draft[0].body_html,
    revision_instructions: $instructions,
    recipient: $draft[0].recipient
  }' \
| curl -X POST http://localhost:8001/agents/weekly-report/revise \
    -H "Content-Type: application/json" \
    --data-binary @- \
| tee apps/ai-service/test-assets/test.json
```

Send the current local draft file:

```bash
curl -X POST http://localhost:8001/agents/weekly-report/send \
  -H "Content-Type: application/json" \
  --data-binary "$(jq '{account_email, recipient, subject, body, body_html, confirm_send: true}' apps/ai-service/test-assets/test.json)"
```

Notes:

- The current send endpoint sends the content you provide in the request body. It does not send a previously saved Outlook draft by `graph_message_id`.
- Saving a revised version creates a new Outlook draft. It does not currently update an existing draft in place.
