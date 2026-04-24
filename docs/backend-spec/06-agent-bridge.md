# Agent Bridge

## Nature
- HTTP-based integration only.
- FastAPI is external and does not provide WebSocket contracts.

## Supported FastAPI Endpoints
- /agents/linkedin-post
- /agents/sprite-sheet
- /agents/ai-news
- /agents/weekly-report/microsoft/start
- /agents/weekly-report/microsoft/accounts
- /agents/weekly-report/history
- /agents/weekly-report/draft
- /agents/weekly-report/revise
- /agents/weekly-report/send
- /agents/weekly-report/save-draft

## NestJS Responsibilities
- Call FastAPI over HTTP.
- Normalize responses into the NestJS envelope.
- Persist request and response logs.
- Convert slow calls into async job flow when needed.
- Emit websocket result events once the FastAPI response is available.

## Slow Response Strategy
1. Create an AgentJob.
2. Call FastAPI.
3. Store the result.
4. Notify the user over WebSocket if the request originated there.
