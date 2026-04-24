from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services import (
    WeeklyReportMessage,
    draft_weekly_report,
    draft_weekly_report_from_context,
    finish_microsoft_auth,
    generate_character_sprite_sheet,
    generate_linkedin_post_with_openai,
    get_random_ai_news_summary,
    get_weekly_report_history,
    list_connected_microsoft_accounts,
    revise_weekly_report,
    save_weekly_report_draft,
    send_weekly_report,
    start_microsoft_auth,
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


class AINewsResponse(BaseModel):
    title: str
    source: str
    published_at: str
    article_url: str
    paragraph: str
    model: str


class WeeklyReportMessageResponse(BaseModel):
    message_id: str
    thread_id: str | None
    subject: str
    sent_at: str | None
    to: list[str]
    cc: list[str]
    snippet: str
    body_text: str
    body_html: str


class MicrosoftAuthStartResponse(BaseModel):
    authorization_url: str
    state: str


class MicrosoftAuthFinishResponse(BaseModel):
    account_email: str
    connected_at: str
    scopes: list[str]


class ConnectedMicrosoftAccountResponse(BaseModel):
    account_email: str
    connected_at: str | None
    scopes: list[str]


class WeeklyReportHistoryResponse(BaseModel):
    account_email: str
    query: str
    emails: list[WeeklyReportMessageResponse]
    last_week_email: WeeklyReportMessageResponse | None


class WeeklyReportDraftRequest(BaseModel):
    account_email: str
    weekly_summary: str = Field(min_length=1, max_length=3000)
    query: str | None = None
    max_examples: int = Field(default=4, ge=1, le=10)
    recipient_override: str | None = None
    subject_override: str | None = None


class WeeklyReportDraftFromContextRequest(BaseModel):
    account_email: str
    weekly_summary: str = Field(min_length=1, max_length=3000)
    query: str | None = None
    source_examples: list[WeeklyReportMessageResponse] = Field(default_factory=list)
    last_week_email: WeeklyReportMessageResponse | None = None
    recipient_override: str | None = None
    subject_override: str | None = None


class WeeklyReportReviseRequest(BaseModel):
    account_email: str
    current_subject: str = Field(min_length=1, max_length=300)
    current_body: str = Field(min_length=1, max_length=12000)
    current_body_html: str | None = None
    revision_instructions: str = Field(min_length=1, max_length=3000)
    recipient: str | None = None


class WeeklyReportDraftResponse(BaseModel):
    account_email: str
    recipient: str
    subject: str
    body: str
    body_html: str
    model: str
    source_examples: list[WeeklyReportMessageResponse]
    last_week_email: WeeklyReportMessageResponse | None


class WeeklyReportSendRequest(BaseModel):
    account_email: str
    recipient: str = Field(min_length=1, max_length=320)
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=12000)
    body_html: str | None = None
    confirm_send: bool = Field(
        default=False,
        description="Must be true or the API will refuse to send the message.",
    )


class WeeklyReportSendResponse(BaseModel):
    account_email: str
    recipient: str
    subject: str
    graph_message_id: str | None
    graph_conversation_id: str | None


class WeeklyReportSaveDraftRequest(BaseModel):
    account_email: str
    recipient: str = Field(min_length=1, max_length=320)
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=12000)
    body_html: str | None = None


class WeeklyReportSaveDraftResponse(BaseModel):
    account_email: str
    recipient: str
    subject: str
    graph_message_id: str
    graph_conversation_id: str | None


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="ai-service",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


def _weekly_report_message_to_response(message: WeeklyReportMessage) -> WeeklyReportMessageResponse:
    return WeeklyReportMessageResponse(
        message_id=message.message_id,
        thread_id=message.thread_id,
        subject=message.subject,
        sent_at=message.sent_at,
        to=message.to,
        cc=message.cc,
        snippet=message.snippet,
        body_text=message.body_text,
        body_html=message.body_html,
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


@app.get("/agents/ai-news", response_model=AINewsResponse)
def get_ai_news() -> AINewsResponse:
    """Fetch a recent AI news item and summarize it into a short paragraph."""

    try:
        result = get_random_ai_news_summary()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI news pipeline failed: {exc}") from exc

    return AINewsResponse(
        title=result.title,
        source=result.source,
        published_at=result.published_at,
        article_url=result.article_url,
        paragraph=result.paragraph,
        model=result.model,
    )


@app.get(
    "/agents/weekly-report/microsoft/auth/start",
    response_model=MicrosoftAuthStartResponse,
)
def start_weekly_report_microsoft_auth() -> MicrosoftAuthStartResponse:
    """Start the Microsoft OAuth flow for Outlook access."""

    try:
        result = start_microsoft_auth()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Microsoft auth start failed: {exc}") from exc

    return MicrosoftAuthStartResponse(
        authorization_url=result["authorization_url"],
        state=result["state"],
    )


@app.get(
    "/agents/weekly-report/microsoft/auth/callback",
    response_model=MicrosoftAuthFinishResponse,
)
def finish_weekly_report_microsoft_auth(
    state: str,
    code: str,
) -> MicrosoftAuthFinishResponse:
    """Finish the Microsoft OAuth flow and persist credentials."""

    try:
        result = finish_microsoft_auth(state=state, code=code)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Microsoft auth callback failed: {exc}") from exc

    return MicrosoftAuthFinishResponse(
        account_email=result["account_email"],
        connected_at=result["connected_at"],
        scopes=result["scopes"],
    )


@app.get(
    "/agents/weekly-report/microsoft/accounts",
    response_model=list[ConnectedMicrosoftAccountResponse],
)
def get_connected_weekly_report_accounts() -> list[ConnectedMicrosoftAccountResponse]:
    """List Outlook accounts connected for the weekly report workflow."""

    try:
        accounts = list_connected_microsoft_accounts()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Listing Microsoft accounts failed: {exc}") from exc

    return [
        ConnectedMicrosoftAccountResponse(
            account_email=account["account_email"],
            connected_at=account.get("connected_at"),
            scopes=list(account.get("scopes", [])),
        )
        for account in accounts
    ]


@app.get(
    "/agents/weekly-report/history",
    response_model=WeeklyReportHistoryResponse,
)
def get_weekly_report_email_history(
    account_email: str,
    query: str | None = None,
    max_results: int = 6,
) -> WeeklyReportHistoryResponse:
    """Return recent 515-style sent emails for the connected Outlook account."""

    try:
        result = get_weekly_report_history(
            account_email=account_email,
            query=query,
            max_results=max_results,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Weekly report history failed: {exc}") from exc

    return WeeklyReportHistoryResponse(
        account_email=result.account_email,
        query=result.query,
        emails=[_weekly_report_message_to_response(message) for message in result.emails],
        last_week_email=(
            _weekly_report_message_to_response(result.last_week_email)
            if result.last_week_email
            else None
        ),
    )


@app.post(
    "/agents/weekly-report/draft",
    response_model=WeeklyReportDraftResponse,
)
def create_weekly_report_draft(
    payload: WeeklyReportDraftRequest,
) -> WeeklyReportDraftResponse:
    """Draft a weekly 515 email from a rough summary and prior examples."""

    try:
        result = draft_weekly_report(
            account_email=payload.account_email,
            weekly_summary=payload.weekly_summary,
            query=payload.query,
            max_examples=payload.max_examples,
            recipient_override=payload.recipient_override,
            subject_override=payload.subject_override,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Weekly report draft failed: {exc}") from exc

    return WeeklyReportDraftResponse(
        account_email=result.account_email,
        recipient=result.recipient,
        subject=result.subject,
        body=result.body,
        body_html=result.body_html,
        model=result.model,
        source_examples=[_weekly_report_message_to_response(message) for message in result.source_examples],
        last_week_email=(
            _weekly_report_message_to_response(result.last_week_email)
            if result.last_week_email
            else None
        ),
    )


@app.post(
    "/agents/weekly-report/draft-from-context",
    response_model=WeeklyReportDraftResponse,
)
def create_weekly_report_draft_from_context(
    payload: WeeklyReportDraftFromContextRequest,
) -> WeeklyReportDraftResponse:
    """Draft a weekly 515 email from caller-provided Outlook examples."""

    try:
        result = draft_weekly_report_from_context(
            account_email=payload.account_email,
            weekly_summary=payload.weekly_summary,
            source_examples=[
                WeeklyReportMessage(
                    message_id=message.message_id,
                    thread_id=message.thread_id,
                    subject=message.subject,
                    sent_at=message.sent_at,
                    to=message.to,
                    cc=message.cc,
                    snippet=message.snippet,
                    body_text=message.body_text,
                    body_html=message.body_html,
                )
                for message in payload.source_examples
            ],
            last_week_email=(
                WeeklyReportMessage(
                    message_id=payload.last_week_email.message_id,
                    thread_id=payload.last_week_email.thread_id,
                    subject=payload.last_week_email.subject,
                    sent_at=payload.last_week_email.sent_at,
                    to=payload.last_week_email.to,
                    cc=payload.last_week_email.cc,
                    snippet=payload.last_week_email.snippet,
                    body_text=payload.last_week_email.body_text,
                    body_html=payload.last_week_email.body_html,
                )
                if payload.last_week_email
                else None
            ),
            recipient_override=payload.recipient_override,
            subject_override=payload.subject_override,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Weekly report draft failed: {exc}") from exc

    return WeeklyReportDraftResponse(
        account_email=result.account_email,
        recipient=result.recipient,
        subject=result.subject,
        body=result.body,
        body_html=result.body_html,
        model=result.model,
        source_examples=[
            _weekly_report_message_to_response(message) for message in result.source_examples
        ],
        last_week_email=(
            _weekly_report_message_to_response(result.last_week_email)
            if result.last_week_email
            else None
        ),
    )


@app.post(
    "/agents/weekly-report/revise",
    response_model=WeeklyReportDraftResponse,
)
def revise_weekly_report_draft(
    payload: WeeklyReportReviseRequest,
) -> WeeklyReportDraftResponse:
    """Revise an in-progress 515 email draft."""

    try:
        result = revise_weekly_report(
            account_email=payload.account_email,
            current_subject=payload.current_subject,
            current_body=payload.current_body,
            current_body_html=payload.current_body_html,
            revision_instructions=payload.revision_instructions,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Weekly report revise failed: {exc}") from exc

    return WeeklyReportDraftResponse(
        account_email=result.account_email,
        recipient=payload.recipient or "",
        subject=result.subject,
        body=result.body,
        body_html=result.body_html,
        model=result.model,
        source_examples=[],
        last_week_email=None,
    )


@app.post(
    "/agents/weekly-report/send",
    response_model=WeeklyReportSendResponse,
)
def send_approved_weekly_report(
    payload: WeeklyReportSendRequest,
) -> WeeklyReportSendResponse:
    """Send the approved 515 email through Microsoft Graph."""

    try:
        result = send_weekly_report(
            account_email=payload.account_email,
            recipient=payload.recipient,
            subject=payload.subject,
            body=payload.body,
            body_html=payload.body_html,
            confirm_send=payload.confirm_send,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Weekly report send failed: {exc}") from exc

    return WeeklyReportSendResponse(
        account_email=result.account_email,
        recipient=result.recipient,
        subject=result.subject,
        graph_message_id=result.graph_message_id,
        graph_conversation_id=result.graph_conversation_id,
    )


@app.post(
    "/agents/weekly-report/save-draft",
    response_model=WeeklyReportSaveDraftResponse,
)
def save_weekly_report_as_outlook_draft(
    payload: WeeklyReportSaveDraftRequest,
) -> WeeklyReportSaveDraftResponse:
    """Save the current 515 email in Outlook Drafts without sending it."""

    try:
        result = save_weekly_report_draft(
            account_email=payload.account_email,
            recipient=payload.recipient,
            subject=payload.subject,
            body=payload.body,
            body_html=payload.body_html,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Weekly report draft save failed: {exc}") from exc

    return WeeklyReportSaveDraftResponse(
        account_email=result.account_email,
        recipient=result.recipient,
        subject=result.subject,
        graph_message_id=result.graph_message_id,
        graph_conversation_id=result.graph_conversation_id,
    )
