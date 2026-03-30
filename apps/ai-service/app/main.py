from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from app.services import generate_linkedin_post_with_openai


app = FastAPI(title="agentic-office-ai-service", version="0.0.1")


class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: str


class PromptRequest(BaseModel):
    prompt: str


class PromptResponse(BaseModel):
    summary: str


class LinkedInPostRequest(BaseModel):
    text: str = Field(
        min_length=1,
        max_length=200,
        description="Plain input text to rewrite as LinkedIn-speak.",
    )


class LinkedInPostResponse(BaseModel):
    post: str
    source_text: str
    tone: str
    model: str


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


@app.post("/agents/linkedin-post", response_model=LinkedInPostResponse)
def create_linkedin_post(payload: LinkedInPostRequest) -> LinkedInPostResponse:
    normalized_text = " ".join(payload.text.split())

    try:
        result = generate_linkedin_post_with_openai(normalized_text)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI request failed: {exc}") from exc

    return LinkedInPostResponse(
        post=result.post,
        source_text=normalized_text,
        tone="playful-linkedin",
        model=result.model,
    )
