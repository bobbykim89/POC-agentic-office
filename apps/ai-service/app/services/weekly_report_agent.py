from __future__ import annotations

"""Gmail-backed weekly 515 drafting workflow."""

import base64
import json
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from openai import OpenAI


DEFAULT_WEEKLY_REPORT_MODEL = "gpt-5-mini"
DEFAULT_WEEKLY_REPORT_QUERY = "in:sent subject:(515 report) newer_than:30d"
DEFAULT_WEEKLY_REPORT_MAX_RESULTS = 6
DEFAULT_WEEKLY_REPORT_RECIPIENT = ""
GOOGLE_GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]


@dataclass(frozen=True)
class WeeklyReportMessage:
    message_id: str
    thread_id: str | None
    subject: str
    sent_at: str | None
    to: list[str]
    cc: list[str]
    snippet: str
    body_text: str


@dataclass(frozen=True)
class WeeklyReportHistoryResult:
    account_email: str
    query: str
    emails: list[WeeklyReportMessage]
    last_week_email: WeeklyReportMessage | None


@dataclass(frozen=True)
class WeeklyReportDraftResult:
    account_email: str
    recipient: str
    subject: str
    body: str
    model: str
    source_examples: list[WeeklyReportMessage]
    last_week_email: WeeklyReportMessage | None


@dataclass(frozen=True)
class WeeklyReportSendResult:
    account_email: str
    recipient: str
    subject: str
    gmail_message_id: str
    gmail_thread_id: str | None


def start_google_gmail_auth() -> dict[str, str]:
    """Create an OAuth URL for a user to connect Gmail."""

    flow = _build_google_oauth_flow()
    state = secrets.token_urlsafe(32)
    authorization_url, returned_state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    _save_pending_oauth_state(returned_state)
    return {"authorization_url": authorization_url, "state": returned_state}


def finish_google_gmail_auth(*, state: str, code: str) -> dict[str, Any]:
    """Exchange an OAuth callback code for stored Gmail credentials."""

    if not _consume_pending_oauth_state(state):
        raise RuntimeError("OAuth state is invalid or expired. Start the Google auth flow again.")

    flow = _build_google_oauth_flow(state=state)
    flow.fetch_token(code=code)

    credentials = flow.credentials
    if not credentials.refresh_token:
        raise RuntimeError("Google did not return a refresh token. Reconnect and grant consent again.")

    gmail_service = build("gmail", "v1", credentials=credentials)
    profile = gmail_service.users().getProfile(userId="me").execute()
    account_email = str(profile.get("emailAddress") or "").strip().lower()
    if not account_email:
        raise RuntimeError("Connected Google account did not return an email address.")

    stored_credentials = json.loads(credentials.to_json())
    token_store = _load_json_file(_google_token_store_path())
    token_store[account_email] = {
        "credentials": stored_credentials,
        "connected_at": datetime.now(timezone.utc).isoformat(),
        "scopes": GOOGLE_GMAIL_SCOPES,
    }
    _save_json_file(_google_token_store_path(), token_store)

    return {
        "account_email": account_email,
        "connected_at": token_store[account_email]["connected_at"],
        "scopes": GOOGLE_GMAIL_SCOPES,
    }


def list_connected_google_accounts() -> list[dict[str, Any]]:
    """Return connected Gmail accounts stored by the service."""

    token_store = _load_json_file(_google_token_store_path())
    return [
        {
            "account_email": account_email,
            "connected_at": record.get("connected_at"),
            "scopes": record.get("scopes", []),
        }
        for account_email, record in sorted(token_store.items())
    ]


def get_weekly_report_history(
    *,
    account_email: str,
    query: str | None = None,
    max_results: int = DEFAULT_WEEKLY_REPORT_MAX_RESULTS,
) -> WeeklyReportHistoryResult:
    """Fetch recent sent 515-style emails from Gmail."""

    gmail_service, _ = _build_gmail_service(account_email)
    search_query = (query or _weekly_report_query()).strip()
    max_results = max(1, min(max_results, 10))

    response = (
        gmail_service.users()
        .messages()
        .list(userId="me", q=search_query, maxResults=max_results)
        .execute()
    )

    messages = response.get("messages", [])
    parsed_messages = [
        _fetch_and_parse_gmail_message(gmail_service=gmail_service, message_id=message["id"])
        for message in messages
        if message.get("id")
    ]

    last_week_email = _select_last_week_email(parsed_messages)
    return WeeklyReportHistoryResult(
        account_email=account_email,
        query=search_query,
        emails=parsed_messages,
        last_week_email=last_week_email,
    )


def draft_weekly_report(
    *,
    account_email: str,
    weekly_summary: str,
    query: str | None = None,
    max_examples: int = DEFAULT_WEEKLY_REPORT_MAX_RESULTS,
    recipient_override: str | None = None,
    subject_override: str | None = None,
) -> WeeklyReportDraftResult:
    """Create a draft email from a rough weekly summary and recent examples."""

    normalized_summary = " ".join(weekly_summary.split())
    if not normalized_summary:
        raise RuntimeError("Provide a short weekly summary before drafting the 515 email.")

    history = get_weekly_report_history(
        account_email=account_email,
        query=query,
        max_results=max_examples,
    )
    latest_email = history.last_week_email or (history.emails[0] if history.emails else None)
    recipient = (
        (recipient_override or "").strip()
        or _first_recipient(latest_email)
        or _weekly_report_default_recipient()
    )
    subject_hint = (subject_override or "").strip() or (latest_email.subject if latest_email else "")

    parsed = _generate_weekly_report_json(
        prompt=_build_draft_prompt(
            weekly_summary=normalized_summary,
            latest_email=latest_email,
            source_examples=history.emails,
            subject_hint=subject_hint,
            recipient_hint=recipient,
        )
    )

    subject = _clean_generated_subject(parsed.get("subject"), subject_hint)
    body = _clean_generated_body(parsed.get("body"))
    if not body:
        raise RuntimeError("The weekly report draft came back empty.")

    return WeeklyReportDraftResult(
        account_email=account_email,
        recipient=recipient,
        subject=subject,
        body=body,
        model=_weekly_report_model(),
        source_examples=history.emails,
        last_week_email=latest_email,
    )


def revise_weekly_report(
    *,
    account_email: str,
    current_subject: str,
    current_body: str,
    revision_instructions: str,
) -> WeeklyReportDraftResult:
    """Revise an existing weekly report draft with user feedback."""

    normalized_instructions = " ".join(revision_instructions.split())
    if not normalized_instructions:
        raise RuntimeError("Provide revision instructions before asking for changes.")

    current_body = current_body.strip()
    if not current_body:
        raise RuntimeError("Provide the current draft body before revising it.")

    parsed = _generate_weekly_report_json(
        prompt=_build_revision_prompt(
            current_subject=current_subject.strip(),
            current_body=current_body,
            revision_instructions=normalized_instructions,
        )
    )

    return WeeklyReportDraftResult(
        account_email=account_email,
        recipient="",
        subject=_clean_generated_subject(parsed.get("subject"), current_subject.strip()),
        body=_clean_generated_body(parsed.get("body")),
        model=_weekly_report_model(),
        source_examples=[],
        last_week_email=None,
    )


def send_weekly_report(
    *,
    account_email: str,
    recipient: str,
    subject: str,
    body: str,
    confirm_send: bool,
) -> WeeklyReportSendResult:
    """Send an approved weekly report through Gmail."""

    if not confirm_send:
        raise RuntimeError("Explicit confirmation is required before sending the email.")

    normalized_recipient = recipient.strip()
    normalized_subject = subject.strip()
    normalized_body = body.strip()
    if not normalized_recipient:
        raise RuntimeError("Provide a recipient email before sending.")
    if not normalized_subject:
        raise RuntimeError("Provide a subject before sending.")
    if not normalized_body:
        raise RuntimeError("Provide a body before sending.")

    gmail_service, _ = _build_gmail_service(account_email)
    message = EmailMessage()
    message["To"] = normalized_recipient
    message["From"] = account_email
    message["Subject"] = normalized_subject
    message.set_content(normalized_body)

    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    response = (
        gmail_service.users()
        .messages()
        .send(userId="me", body={"raw": raw_message})
        .execute()
    )

    return WeeklyReportSendResult(
        account_email=account_email,
        recipient=normalized_recipient,
        subject=normalized_subject,
        gmail_message_id=str(response.get("id") or ""),
        gmail_thread_id=response.get("threadId"),
    )


def _build_google_oauth_flow(*, state: str | None = None) -> Flow:
    """Build the Google OAuth flow from service env configuration."""

    load_dotenv()
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
    redirect_uri = os.getenv("GOOGLE_OAUTH_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        raise RuntimeError(
            "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and "
            "GOOGLE_OAUTH_REDIRECT_URI must be configured for the weekly report agent."
        )

    client_config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }

    flow = Flow.from_client_config(client_config, scopes=GOOGLE_GMAIL_SCOPES, state=state)
    flow.redirect_uri = redirect_uri
    return flow


def _build_gmail_service(account_email: str) -> tuple[Any, Credentials]:
    """Load stored credentials, refresh them if needed, and build Gmail service."""

    load_dotenv()
    normalized_email = account_email.strip().lower()
    token_store = _load_json_file(_google_token_store_path())
    record = token_store.get(normalized_email)
    if not record:
        raise RuntimeError(f"No connected Google account found for {normalized_email}.")

    credentials_data = record.get("credentials")
    if not isinstance(credentials_data, dict):
        raise RuntimeError(f"Stored Google credentials for {normalized_email} are invalid.")

    credentials = Credentials.from_authorized_user_info(credentials_data, GOOGLE_GMAIL_SCOPES)
    if not credentials.valid:
        if credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
            record["credentials"] = json.loads(credentials.to_json())
            token_store[normalized_email] = record
            _save_json_file(_google_token_store_path(), token_store)
        else:
            raise RuntimeError(
                f"Google credentials for {normalized_email} are not valid. Reconnect the account."
            )

    gmail_service = build("gmail", "v1", credentials=credentials)
    return gmail_service, credentials


def _fetch_and_parse_gmail_message(*, gmail_service: Any, message_id: str) -> WeeklyReportMessage:
    """Load a Gmail message and normalize headers/body for prompting."""

    message = (
        gmail_service.users()
        .messages()
        .get(userId="me", id=message_id, format="full")
        .execute()
    )

    payload = message.get("payload", {})
    headers = {header.get("name", "").lower(): header.get("value", "") for header in payload.get("headers", [])}
    subject = headers.get("subject", "").strip()
    raw_to = headers.get("to", "").strip()
    raw_cc = headers.get("cc", "").strip()
    raw_date = headers.get("date", "").strip()

    sent_at = None
    if raw_date:
        try:
            parsed_date = parsedate_to_datetime(raw_date)
            if parsed_date.tzinfo is None:
                parsed_date = parsed_date.replace(tzinfo=timezone.utc)
            sent_at = parsed_date.astimezone(timezone.utc).isoformat()
        except Exception:
            sent_at = raw_date

    return WeeklyReportMessage(
        message_id=message_id,
        thread_id=message.get("threadId"),
        subject=subject,
        sent_at=sent_at,
        to=[part.strip() for part in raw_to.split(",") if part.strip()],
        cc=[part.strip() for part in raw_cc.split(",") if part.strip()],
        snippet=str(message.get("snippet") or "").strip(),
        body_text=_extract_gmail_body_text(payload),
    )


def _extract_gmail_body_text(payload: dict[str, Any]) -> str:
    """Extract readable text from a Gmail message payload."""

    plain_text = _find_mime_part_body(payload, wanted_mime_type="text/plain")
    if plain_text:
        return plain_text

    html_text = _find_mime_part_body(payload, wanted_mime_type="text/html")
    if html_text:
        return _html_to_text(html_text)

    return ""


def _find_mime_part_body(payload: dict[str, Any], *, wanted_mime_type: str) -> str:
    """Recursively find and decode a Gmail payload part by mime type."""

    mime_type = str(payload.get("mimeType") or "")
    body = payload.get("body", {}) or {}
    data = body.get("data")

    if mime_type == wanted_mime_type and data:
        return _decode_gmail_body_data(data)

    for part in payload.get("parts", []) or []:
        found = _find_mime_part_body(part, wanted_mime_type=wanted_mime_type)
        if found:
            return found

    return ""


def _decode_gmail_body_data(data: str) -> str:
    """Decode Gmail's URL-safe base64 message body encoding."""

    padding = "=" * (-len(data) % 4)
    decoded = base64.urlsafe_b64decode(data + padding)
    return decoded.decode("utf-8", errors="replace").strip()


def _html_to_text(text: str) -> str:
    """Collapse simple HTML to readable text for prompting."""

    import re

    no_tags = re.sub(r"<[^>]+>", " ", text)
    return " ".join(no_tags.split())


def _select_last_week_email(emails: list[WeeklyReportMessage]) -> WeeklyReportMessage | None:
    """Choose the most likely previous weekly report from recent sent messages."""

    if not emails:
        return None

    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    for email in emails:
        if not email.sent_at:
            continue
        try:
            sent_at = datetime.fromisoformat(email.sent_at)
        except ValueError:
            continue
        if sent_at >= cutoff:
            return email
    return emails[0]


def _first_recipient(message: WeeklyReportMessage | None) -> str:
    if message and message.to:
        return message.to[0]
    return ""


def _generate_weekly_report_json(*, prompt: str) -> dict[str, Any]:
    """Generate a JSON draft payload through OpenAI."""

    client = _build_openai_client()
    response = client.responses.create(
        model=_weekly_report_model(),
        input=prompt,
    )
    return _parse_json_object(response.output_text)


def _build_draft_prompt(
    *,
    weekly_summary: str,
    latest_email: WeeklyReportMessage | None,
    source_examples: list[WeeklyReportMessage],
    subject_hint: str,
    recipient_hint: str,
) -> str:
    """Construct the drafting prompt with examples and user summary."""

    formatted_examples = "\n\n".join(
        (
            f"Example {index + 1}\n"
            f"Subject: {example.subject}\n"
            f"Sent At: {example.sent_at}\n"
            f"To: {', '.join(example.to)}\n"
            f"Body:\n{example.body_text}"
        )
        for index, example in enumerate(source_examples[:DEFAULT_WEEKLY_REPORT_MAX_RESULTS])
    )

    latest_reference = ""
    if latest_email:
        latest_reference = (
            "Most recent 515 reference:\n"
            f"Subject: {latest_email.subject}\n"
            f"To: {', '.join(latest_email.to)}\n"
            f"Body:\n{latest_email.body_text}\n\n"
        )

    return (
        "You are drafting a professional but natural weekly 515 status email. "
        "Return JSON only with keys subject and body. "
        "Preserve the tone, format, and approximate length of the prior examples. "
        "Use the user's rough weekly summary to infer clearer wording, but do not invent major accomplishments. "
        "Write the body as a polished email that is ready to send.\n\n"
        f"Suggested recipient: {recipient_hint or 'unknown'}\n"
        f"Subject hint: {subject_hint or 'derive from examples'}\n\n"
        f"User rough weekly summary:\n{weekly_summary}\n\n"
        f"{latest_reference}"
        f"Prior examples:\n{formatted_examples}"
    )


def _build_revision_prompt(
    *,
    current_subject: str,
    current_body: str,
    revision_instructions: str,
) -> str:
    """Construct a revision prompt for an in-progress weekly report email."""

    return (
        "Revise this weekly 515 email draft. Return JSON only with keys subject and body. "
        "Preserve the same overall purpose and professional tone unless the revision request says otherwise.\n\n"
        f"Current subject:\n{current_subject}\n\n"
        f"Current body:\n{current_body}\n\n"
        f"Revision instructions:\n{revision_instructions}"
    )


def _clean_generated_subject(raw_subject: Any, fallback_subject: str) -> str:
    subject = " ".join(str(raw_subject or fallback_subject or "").split()).strip()
    if subject:
        return subject
    return "515 Report"


def _clean_generated_body(raw_body: Any) -> str:
    return str(raw_body or "").strip()


def _build_openai_client() -> OpenAI:
    """Build a local OpenAI client from env."""

    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured for the weekly report agent.")
    return OpenAI(api_key=api_key)


def _weekly_report_model() -> str:
    load_dotenv()
    return os.getenv("OPENAI_515_MODEL", DEFAULT_WEEKLY_REPORT_MODEL)


def _weekly_report_query() -> str:
    load_dotenv()
    return os.getenv("WEEKLY_REPORT_GMAIL_QUERY", DEFAULT_WEEKLY_REPORT_QUERY)


def _weekly_report_default_recipient() -> str:
    load_dotenv()
    return os.getenv("WEEKLY_REPORT_DEFAULT_TO", DEFAULT_WEEKLY_REPORT_RECIPIENT).strip()


def _google_token_store_path() -> Path:
    return _weekly_report_generated_dir() / "google_accounts.json"


def _google_state_store_path() -> Path:
    return _weekly_report_generated_dir() / "google_oauth_states.json"


def _weekly_report_generated_dir() -> Path:
    path = _project_root() / "generated" / "weekly_reports"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _save_pending_oauth_state(state: str) -> None:
    state_store = _load_json_file(_google_state_store_path())
    state_store[state] = {"created_at": datetime.now(timezone.utc).isoformat()}
    _save_json_file(_google_state_store_path(), state_store)


def _consume_pending_oauth_state(state: str) -> bool:
    state_store = _load_json_file(_google_state_store_path())
    record = state_store.pop(state, None)
    if record is None:
        return False

    fresh_states: dict[str, Any] = {}
    expiry_cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    for known_state, known_record in state_store.items():
        created_at = known_record.get("created_at")
        try:
            parsed_created_at = datetime.fromisoformat(str(created_at))
        except ValueError:
            continue
        if parsed_created_at >= expiry_cutoff:
            fresh_states[known_state] = known_record

    _save_json_file(_google_state_store_path(), fresh_states)
    return True


def _load_json_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}


def _save_json_file(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True))


def _parse_json_object(text: str) -> dict[str, Any]:
    import re

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return {}

    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}
