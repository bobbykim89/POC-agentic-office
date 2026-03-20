from datetime import datetime, timezone

from fastapi import FastAPI
from pydantic import BaseModel


app = FastAPI(title="agentic-office-ai-service", version="0.0.1")


class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: str


class PromptRequest(BaseModel):
    prompt: str


class PromptResponse(BaseModel):
    summary: str


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="ai-service",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@app.post("/prompt", response_model=PromptResponse)
def prompt(payload: PromptRequest) -> PromptResponse:
    summary = f"AI service received prompt with {len(payload.prompt)} characters."
    return PromptResponse(summary=summary)
