from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services import (
    generate_character_sprite_sheet,
    generate_linkedin_post_with_openai,
    validation_to_dict,
)


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


class SpriteSheetResponse(BaseModel):
    character_description: str
    input_kind: str
    file_name: str
    relative_image_path: str
    absolute_image_path: str
    image_width: int
    image_height: int
    final_sprite_height: int
    generation_attempts: int
    generation_model: str
    validation: dict[str, Any]
    storage_record: dict[str, Any]


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
    """Rewrite short text into playful LinkedIn-style copy."""

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


@app.post("/agents/sprite-sheet", response_model=SpriteSheetResponse)
async def create_sprite_sheet(
    description: str | None = Form(default=None),
    image: UploadFile | None = File(default=None),
) -> SpriteSheetResponse:
    """Generate a 3-view sprite sheet from either text or an uploaded image."""

    if not description and image is None:
        raise HTTPException(status_code=400, detail="Provide either a description or an image.")

    image_bytes: bytes | None = None
    image_mime_type: str | None = None

    if image is not None:
        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Uploaded image is empty.")
        image_mime_type = image.content_type or "image/png"

    try:
        # The service layer handles extraction, generation, validation, retries,
        # background cleanup, cropping, and local persistence.
        result = generate_character_sprite_sheet(
            description=description,
            image_bytes=image_bytes,
            image_mime_type=image_mime_type,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Sprite pipeline failed: {exc}") from exc

    return SpriteSheetResponse(
        character_description=result.character_description,
        input_kind=result.input_kind,
        file_name=result.file_name,
        relative_image_path=result.relative_image_path,
        absolute_image_path=result.absolute_image_path,
        image_width=result.image_width,
        image_height=result.image_height,
        final_sprite_height=result.final_sprite_height,
        generation_attempts=result.generation_attempts,
        generation_model=result.generation_model,
        validation=validation_to_dict(result.validation),
        storage_record=result.storage_record,
    )
