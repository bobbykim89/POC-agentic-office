from __future__ import annotations

"""Microsoft Graph-backed weekly 515 drafting workflow."""

import json
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import requests
from dotenv import load_dotenv
from openai import OpenAI


DEFAULT_WEEKLY_REPORT_MODEL = "gpt-5-mini"
DEFAULT_WEEKLY_REPORT_SUBJECT_QUERY = "515 report"
DEFAULT_WEEKLY_REPORT_MAX_RESULTS = 6
DEFAULT_WEEKLY_REPORT_RECIPIENT = ""
DEFAULT_WEEKLY_REPORT_DAYS_BACK = 30
DEFAULT_MICROSOFT_TENANT = "organizations"
DEFAULT_WEEKLY_REPORT_TIMEZONE = "America/Phoenix"
MICROSOFT_GRAPH_SCOPES = [
    "offline_access",
    "openid",
    "profile",
    "User.Read",
    "Mail.Read",
    "Mail.ReadWrite",
    "Mail.Send",
]


@dataclass(frozen=True)
class WeeklyReportMessage:
    """Normalized Outlook message used for prompting and API responses."""

    message_id: str
    thread_id: str | None
    subject: str
    sent_at: str | None
    to: list[str]
    cc: list[str]
    snippet: str
    body_text: str
    body_html: str


@dataclass(frozen=True)
class WeeklyReportHistoryResult:
    """Recent sent-message lookup result for weekly report examples."""

    account_email: str
    query: str
    emails: list[WeeklyReportMessage]
    last_week_email: WeeklyReportMessage | None


@dataclass(frozen=True)
class WeeklyReportDraftResult:
    """Drafted weekly report content in both text and HTML forms."""

    account_email: str
    recipient: str
    subject: str
    body: str
    body_html: str
    model: str
    source_examples: list[WeeklyReportMessage]
    last_week_email: WeeklyReportMessage | None


@dataclass(frozen=True)
class WeeklyReportSendResult:
    """Metadata returned after Graph accepts a send request."""

    account_email: str
    recipient: str
    subject: str
    graph_message_id: str | None
    graph_conversation_id: str | None


@dataclass(frozen=True)
class WeeklyReportSaveDraftResult:
    """Metadata returned after Graph creates an Outlook draft."""

    account_email: str
    recipient: str
    subject: str
    graph_message_id: str
    graph_conversation_id: str | None


def start_microsoft_auth() -> dict[str, str]:
    """Create an OAuth URL for a user to connect Outlook/Microsoft 365 mail."""

    client_id, _, redirect_uri, tenant = _microsoft_oauth_settings()
    state = secrets.token_urlsafe(32)
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "response_mode": "query",
        "scope": " ".join(_graph_scopes()),
        "state": state,
    }
    authorization_url = (
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?"
        f"{urlencode(params)}"
    )
    _save_pending_oauth_state(state)
    return {"authorization_url": authorization_url, "state": state}


def finish_microsoft_auth(*, state: str, code: str) -> dict[str, Any]:
    """Exchange an OAuth callback code for stored Microsoft Graph credentials."""

    if not _consume_pending_oauth_state(state):
        raise RuntimeError("OAuth state is invalid or expired. Start the Microsoft auth flow again.")

    client_id, client_secret, redirect_uri, tenant = _microsoft_oauth_settings()
    response = requests.post(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "scope": " ".join(_graph_scopes()),
        },
        timeout=30,
    )
    token_payload = _parse_oauth_response(response)
    _ensure_refresh_token(token_payload)

    profile = _graph_request(
        method="GET",
        path="/me",
        access_token=token_payload["access_token"],
        params={"$select": "id,displayName,mail,userPrincipalName"},
    )
    account_email = _normalize_account_email(profile)
    connected_at = datetime.now(timezone.utc).isoformat()

    token_store = _load_json_file(_microsoft_token_store_path())
    token_store[account_email] = {
        "connected_at": connected_at,
        "credentials": _build_stored_credentials(token_payload),
        "profile": {
            "display_name": profile.get("displayName"),
            "mail": profile.get("mail"),
            "user_principal_name": profile.get("userPrincipalName"),
            "id": profile.get("id"),
        },
        "scopes": _graph_scopes(),
    }
    _save_json_file(_microsoft_token_store_path(), token_store)

    return {
        "account_email": account_email,
        "connected_at": connected_at,
        "scopes": _graph_scopes(),
    }


def list_connected_microsoft_accounts() -> list[dict[str, Any]]:
    """Return connected Outlook accounts stored by the service."""

    token_store = _load_json_file(_microsoft_token_store_path())
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
    """Fetch recent sent 515-style emails from Microsoft 365.

    We intentionally pull a slightly larger recent window from Sent Items first,
    then apply subject/date filtering locally. That keeps the query behavior
    predictable across tenants while still letting us tune matching rules in
    Python.
    """

    access_token = _get_access_token(account_email)
    subject_query = (query or _weekly_report_subject_query()).strip()
    max_results = max(1, min(max_results, 10))

    raw_messages = _graph_request(
        method="GET",
        path="/me/mailFolders/sentitems/messages",
        access_token=access_token,
        params={
            "$top": "25",
            "$orderby": "sentDateTime DESC",
            "$select": (
                "id,conversationId,subject,sentDateTime,bodyPreview,body,"
                "toRecipients,ccRecipients"
            ),
        },
    ).get("value", [])

    filtered_messages = [
        _parse_graph_message(message)
        for message in raw_messages
        if _message_matches_subject_query(message.get("subject"), subject_query)
        and _message_within_days(message.get("sentDateTime"), _weekly_report_days_back())
    ][:max_results]

    last_week_email = _select_last_week_email(filtered_messages)
    return WeeklyReportHistoryResult(
        account_email=account_email,
        query=subject_query,
        emails=filtered_messages,
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
    subject_hint = (subject_override or "").strip() or _default_weekly_report_subject(latest_email)

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
    body_html = _clean_generated_body_html(parsed.get("body_html"), body)
    if not body:
        raise RuntimeError("The weekly report draft came back empty.")

    return WeeklyReportDraftResult(
        account_email=account_email,
        recipient=recipient,
        subject=subject,
        body=body,
        body_html=body_html,
        model=_weekly_report_model(),
        source_examples=history.emails,
        last_week_email=latest_email,
    )


def revise_weekly_report(
    *,
    account_email: str,
    current_subject: str,
    current_body: str,
    current_body_html: str | None,
    revision_instructions: str,
) -> WeeklyReportDraftResult:
    """Revise an existing weekly report draft with user feedback.

    The revision step keeps both plain text and HTML in play so the model can
    adjust wording without flattening the email formatting that Outlook users
    expect.
    """

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
            current_body_html=current_body_html,
            revision_instructions=normalized_instructions,
        )
    )

    revised_body = _clean_generated_body(parsed.get("body"))
    return WeeklyReportDraftResult(
        account_email=account_email,
        recipient="",
        subject=_clean_generated_subject(parsed.get("subject"), current_subject.strip()),
        body=revised_body,
        body_html=_clean_generated_body_html(parsed.get("body_html"), revised_body),
        model=_weekly_report_model(),
        source_examples=[],
        last_week_email=None,
    )


def save_weekly_report_draft(
    *,
    account_email: str,
    recipient: str,
    subject: str,
    body: str,
    body_html: str | None = None,
) -> WeeklyReportSaveDraftResult:
    """Save the current weekly report draft into Outlook Drafts without sending."""

    normalized_recipient = recipient.strip()
    normalized_subject = subject.strip()
    normalized_body = body.strip()
    if not normalized_recipient:
        raise RuntimeError("Provide a recipient email before saving a draft.")
    if not normalized_subject:
        raise RuntimeError("Provide a subject before saving a draft.")
    if not normalized_body:
        raise RuntimeError("Provide a body before saving a draft.")

    access_token = _get_access_token(account_email)
    response = _graph_request(
        method="POST",
        path="/me/messages",
        access_token=access_token,
        json_body=_build_graph_message_payload(
            recipient=normalized_recipient,
            subject=normalized_subject,
            body=normalized_body,
            body_html=body_html,
        ),
    )

    return WeeklyReportSaveDraftResult(
        account_email=account_email,
        recipient=normalized_recipient,
        subject=normalized_subject,
        graph_message_id=str(response.get("id") or ""),
        graph_conversation_id=response.get("conversationId"),
    )


def send_weekly_report(
    *,
    account_email: str,
    recipient: str,
    subject: str,
    body: str,
    body_html: str | None = None,
    confirm_send: bool,
) -> WeeklyReportSendResult:
    """Send an approved weekly report through Microsoft Graph.

    The current implementation sends by creating a Graph draft message first and
    then issuing a send call for that message. It does not mutate or send an
    already-saved Outlook draft by message id.
    """

    if not confirm_send:
        raise RuntimeError("Explicit confirmation is required before sending the email.")

    draft = save_weekly_report_draft(
        account_email=account_email,
        recipient=recipient,
        subject=subject,
        body=body,
        body_html=body_html,
    )

    access_token = _get_access_token(account_email)
    _graph_request(
        method="POST",
        path=f"/me/messages/{draft.graph_message_id}/send",
        access_token=access_token,
    )

    return WeeklyReportSendResult(
        account_email=account_email,
        recipient=draft.recipient,
        subject=draft.subject,
        graph_message_id=draft.graph_message_id,
        graph_conversation_id=draft.graph_conversation_id,
    )


def _microsoft_oauth_settings() -> tuple[str, str, str, str]:
    """Load Microsoft OAuth settings from env.

    These values come from a Microsoft Entra app registration:
    - `MICROSOFT_CLIENT_ID`: Application (client) ID
    - `MICROSOFT_CLIENT_SECRET`: client secret value from Certificates & secrets
    - `MICROSOFT_TENANT_ID`: Directory (tenant) ID or `organizations`
    - `MICROSOFT_REDIRECT_URI`: configured web redirect URI
    """

    load_dotenv()
    client_id = os.getenv("MICROSOFT_CLIENT_ID")
    client_secret = os.getenv("MICROSOFT_CLIENT_SECRET")
    redirect_uri = os.getenv("MICROSOFT_REDIRECT_URI")
    tenant = os.getenv("MICROSOFT_TENANT_ID", DEFAULT_MICROSOFT_TENANT).strip() or DEFAULT_MICROSOFT_TENANT
    if not client_id or not client_secret or not redirect_uri:
        raise RuntimeError(
            "MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_REDIRECT_URI "
            "must be configured for the weekly report agent."
        )
    return client_id, client_secret, redirect_uri, tenant


def _get_access_token(account_email: str) -> str:
    """Return a valid Graph access token for a connected Outlook account."""

    normalized_email = account_email.strip().lower()
    token_store = _load_json_file(_microsoft_token_store_path())
    record = token_store.get(normalized_email)
    if not record:
        raise RuntimeError(f"No connected Microsoft account found for {normalized_email}.")

    credentials = record.get("credentials", {})
    if not isinstance(credentials, dict):
        raise RuntimeError(f"Stored Microsoft credentials for {normalized_email} are invalid.")

    expires_at = credentials.get("expires_at")
    access_token = credentials.get("access_token")
    refresh_token = credentials.get("refresh_token")
    if access_token and _token_still_valid(expires_at):
        return str(access_token)

    if not refresh_token:
        raise RuntimeError(f"Microsoft credentials for {normalized_email} cannot be refreshed. Reconnect the account.")

    client_id, client_secret, _, tenant = _microsoft_oauth_settings()
    response = requests.post(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
            "scope": " ".join(_graph_scopes()),
        },
        timeout=30,
    )
    refreshed = _parse_oauth_response(response)
    refreshed["refresh_token"] = refreshed.get("refresh_token") or refresh_token
    record["credentials"] = _build_stored_credentials(refreshed)
    token_store[normalized_email] = record
    _save_json_file(_microsoft_token_store_path(), token_store)
    return str(record["credentials"]["access_token"])


def _graph_request(
    *,
    method: str,
    path: str,
    access_token: str,
    params: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Call Microsoft Graph and return JSON when available."""

    response = requests.request(
        method=method,
        url=f"https://graph.microsoft.com/v1.0{path}",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        params=params,
        json=json_body,
        timeout=30,
    )

    if response.status_code >= 400:
        detail = _extract_graph_error(response)
        raise RuntimeError(f"Microsoft Graph request failed: {detail}")

    if not response.text.strip():
        return {}

    try:
        return response.json()
    except ValueError:
        return {}


def _parse_oauth_response(response: requests.Response) -> dict[str, Any]:
    """Parse an OAuth token response or raise a helpful error."""

    try:
        payload = response.json()
    except ValueError as exc:
        raise RuntimeError("Microsoft OAuth did not return valid JSON.") from exc

    if response.status_code >= 400:
        error = payload.get("error_description") or payload.get("error") or response.text
        raise RuntimeError(f"Microsoft OAuth failed: {error}")
    return payload


def _extract_graph_error(response: requests.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text

    error = payload.get("error", {})
    if isinstance(error, dict):
        return str(error.get("message") or error.get("code") or payload)
    return str(error or payload)


def _ensure_refresh_token(token_payload: dict[str, Any]) -> None:
    if not token_payload.get("refresh_token"):
        raise RuntimeError(
            "Microsoft did not return a refresh token. Reconnect and make sure offline access is granted."
        )


def _normalize_account_email(profile: dict[str, Any]) -> str:
    account_email = str(profile.get("mail") or profile.get("userPrincipalName") or "").strip().lower()
    if not account_email:
        raise RuntimeError("Connected Microsoft account did not return an email address.")
    return account_email


def _build_stored_credentials(token_payload: dict[str, Any]) -> dict[str, Any]:
    expires_in = int(token_payload.get("expires_in") or 3600)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(expires_in - 120, 60))
    return {
        "access_token": token_payload.get("access_token"),
        "refresh_token": token_payload.get("refresh_token"),
        "token_type": token_payload.get("token_type"),
        "expires_at": expires_at.isoformat(),
    }


def _token_still_valid(expires_at: Any) -> bool:
    if not isinstance(expires_at, str):
        return False

    try:
        parsed = datetime.fromisoformat(expires_at)
    except ValueError:
        return False
    return parsed > datetime.now(timezone.utc)


def _parse_graph_message(message: dict[str, Any]) -> WeeklyReportMessage:
    """Convert a raw Graph message into the app's prompt-friendly shape."""

    return WeeklyReportMessage(
        message_id=str(message.get("id") or ""),
        thread_id=message.get("conversationId"),
        subject=str(message.get("subject") or "").strip(),
        sent_at=message.get("sentDateTime"),
        to=_graph_recipients_to_list(message.get("toRecipients")),
        cc=_graph_recipients_to_list(message.get("ccRecipients")),
        snippet=str(message.get("bodyPreview") or "").strip(),
        body_text=_graph_body_to_text(message.get("body")),
        body_html=_graph_body_to_html(message.get("body")),
    )


def _graph_recipients_to_list(raw_recipients: Any) -> list[str]:
    recipients: list[str] = []
    if not isinstance(raw_recipients, list):
        return recipients

    for recipient in raw_recipients:
        email_address = recipient.get("emailAddress", {}) if isinstance(recipient, dict) else {}
        address = str(email_address.get("address") or "").strip()
        if address:
            recipients.append(address)
    return recipients


def _graph_body_to_text(body: Any) -> str:
    """Convert a Graph body payload into compact plain text for prompting."""

    if not isinstance(body, dict):
        return ""

    content = str(body.get("content") or "")
    content_type = str(body.get("contentType") or "").lower()
    if content_type == "html":
        import re

        content = re.sub(r"<[^>]+>", " ", content)
    return " ".join(content.split()).strip()


def _graph_body_to_html(body: Any) -> str:
    """Return the HTML body when available, with a text fallback when needed."""

    if not isinstance(body, dict):
        return ""

    content = str(body.get("content") or "").strip()
    content_type = str(body.get("contentType") or "").lower()
    if content_type == "html":
        return content
    if not content:
        return ""
    return _plain_text_to_html(content)


def _message_matches_subject_query(subject: Any, query: str) -> bool:
    """Perform a simple contains-all-terms subject match."""

    normalized_subject = str(subject or "").lower()
    normalized_query = query.lower().strip()
    if not normalized_query:
        return True

    required_terms = [term for term in normalized_query.replace(",", " ").split() if term]
    return all(term in normalized_subject for term in required_terms)


def _message_within_days(sent_at: Any, days_back: int) -> bool:
    if not isinstance(sent_at, str) or not sent_at:
        return False

    try:
        normalized = sent_at.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return False

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed >= datetime.now(timezone.utc) - timedelta(days=days_back)


def _select_last_week_email(emails: list[WeeklyReportMessage]) -> WeeklyReportMessage | None:
    """Choose the most likely previous weekly report from recent sent messages."""

    if not emails:
        return None

    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    for email in emails:
        if not email.sent_at:
            continue
        try:
            sent_at = datetime.fromisoformat(email.sent_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        if sent_at >= cutoff:
            return email
    return emails[0]


def _first_recipient(message: WeeklyReportMessage | None) -> str:
    if message and message.to:
        return message.to[0]
    return ""


def _build_graph_message_payload(
    *,
    recipient: str,
    subject: str,
    body: str,
    body_html: str | None = None,
) -> dict[str, Any]:
    """Build the Graph message payload used for draft-save and send flows."""

    html_content = body_html.strip() if body_html else _plain_text_to_html(body)
    return {
        "subject": subject,
        "body": {
            "contentType": "HTML",
            "content": html_content,
        },
        "toRecipients": [
            {
                "emailAddress": {
                    "address": recipient,
                }
            }
        ],
    }


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
    formatted_examples = "\n\n".join(
        (
            f"Example {index + 1}\n"
            f"Subject: {example.subject}\n"
            f"Sent At: {example.sent_at}\n"
            f"To: {', '.join(example.to)}\n"
            f"Body Text:\n{example.body_text}\n"
            f"Body HTML:\n{example.body_html}"
        )
        for index, example in enumerate(source_examples[:DEFAULT_WEEKLY_REPORT_MAX_RESULTS])
    )

    latest_reference = ""
    if latest_email:
        latest_reference = (
            "Most recent 515 reference:\n"
            f"Subject: {latest_email.subject}\n"
            f"To: {', '.join(latest_email.to)}\n"
            f"Body Text:\n{latest_email.body_text}\n"
            f"Body HTML:\n{latest_email.body_html}\n\n"
        )

    return (
        "You are drafting a professional but natural weekly 515 status email. "
        "Return JSON only with keys subject, body, and body_html. "
        "Preserve the tone, format, rich text styling, and approximate length of the prior examples. "
        "Infer the user's real tone from the prior examples instead of imposing a generic style. "
        "Prioritize the most recent examples when the tone or formatting varies over time. "
        "Match the user's typical level of formality, warmth, directness, detail, and structure. "
        "Do not make the writing more polished, more dramatic, more enthusiastic, or more corporate than the examples themselves. "
        "When the user mentions something informally, rewrite it into professional language that still sounds like the same person who wrote the earlier emails. "
        "Preserve recurring habits from the examples when reasonable, such as section names, greeting style, signoff style, bullet usage, and email length. "
        "Use the user's rough weekly summary to infer clearer wording, but do not invent major accomplishments. "
        "Write the body as a polished email that is ready to send. "
        "The body field should be clean readable plain text. "
        "The body_html field should preserve formatting such as bold labels, paragraph spacing, and bullet lists.\n\n"
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
    current_body_html: str | None,
    revision_instructions: str,
) -> str:
    return (
        "Revise this weekly 515 email draft. Return JSON only with keys subject, body, and body_html. "
        "Preserve the same overall purpose, professional tone, and formatting unless the revision request says otherwise.\n\n"
        "Keep the voice aligned with the user's prior examples rather than a generic assistant voice. "
        "Avoid making the draft more corporate, more dramatic, more polished, or more enthusiastic than the user's usual style unless the revision request explicitly asks for that.\n\n"
        f"Current subject:\n{current_subject}\n\n"
        f"Current body:\n{current_body}\n\n"
        f"Current body HTML:\n{current_body_html or ''}\n\n"
        f"Revision instructions:\n{revision_instructions}"
    )


def _clean_generated_subject(raw_subject: Any, fallback_subject: str) -> str:
    subject = " ".join(str(raw_subject or fallback_subject or "").split()).strip()
    if subject:
        return subject
    return "515 Report"


def _clean_generated_body(raw_body: Any) -> str:
    return str(raw_body or "").strip()


def _clean_generated_body_html(raw_body_html: Any, fallback_body: str) -> str:
    body_html = str(raw_body_html or "").strip()
    if body_html:
        return body_html
    return _plain_text_to_html(fallback_body)


def _build_openai_client() -> OpenAI:
    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured for the weekly report agent.")
    return OpenAI(api_key=api_key)


def _weekly_report_model() -> str:
    load_dotenv()
    return os.getenv("OPENAI_515_MODEL", DEFAULT_WEEKLY_REPORT_MODEL)


def _weekly_report_subject_query() -> str:
    load_dotenv()
    return os.getenv("WEEKLY_REPORT_SUBJECT_QUERY", DEFAULT_WEEKLY_REPORT_SUBJECT_QUERY)


def _weekly_report_default_recipient() -> str:
    load_dotenv()
    return os.getenv("WEEKLY_REPORT_DEFAULT_TO", DEFAULT_WEEKLY_REPORT_RECIPIENT).strip()


def _weekly_report_days_back() -> int:
    load_dotenv()
    raw_value = os.getenv("WEEKLY_REPORT_LOOKBACK_DAYS")
    if raw_value is None:
        return DEFAULT_WEEKLY_REPORT_DAYS_BACK
    try:
        return max(1, int(raw_value))
    except ValueError:
        return DEFAULT_WEEKLY_REPORT_DAYS_BACK


def _weekly_report_timezone() -> str:
    load_dotenv()
    return os.getenv("WEEKLY_REPORT_TIMEZONE", DEFAULT_WEEKLY_REPORT_TIMEZONE)


def _default_weekly_report_subject(latest_email: WeeklyReportMessage | None) -> str:
    """Roll the most recent subject forward to today's date when possible."""

    import re

    today_text = _today_in_weekly_report_timezone().strftime("%m/%d/%Y")
    if latest_email and latest_email.subject:
        if re.search(r"\b\d{2}/\d{2}/\d{4}\b", latest_email.subject):
            return re.sub(r"\b\d{2}/\d{2}/\d{4}\b", today_text, latest_email.subject, count=1)
    return f"515 weekly report - week ending - {today_text}"


def _today_in_weekly_report_timezone() -> datetime:
    timezone_name = _weekly_report_timezone()
    try:
        return datetime.now(ZoneInfo(timezone_name))
    except Exception:
        return datetime.now()


def _plain_text_to_html(text: str) -> str:
    """Convert simple sectioned plain text into lightweight Outlook-friendly HTML."""

    lines = [line.strip() for line in text.splitlines()]
    if not any(lines):
        return ""

    html_parts: list[str] = []
    in_list = False

    for line in lines:
        if not line:
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            continue

        if line.startswith(("- ", "* ")):
            if not in_list:
                html_parts.append("<ul>")
                in_list = True
            html_parts.append(f"<li>{escape(line[2:].strip())}</li>")
            continue

        if in_list:
            html_parts.append("</ul>")
            in_list = False

        if line.endswith(":") and len(line) < 80:
            html_parts.append(f"<p><strong>{escape(line[:-1])}:</strong></p>")
        else:
            html_parts.append(f"<p>{escape(line)}</p>")

    if in_list:
        html_parts.append("</ul>")

    return "".join(html_parts)


def _graph_scopes() -> list[str]:
    return [f"https://graph.microsoft.com/{scope}" if "." in scope else scope for scope in MICROSOFT_GRAPH_SCOPES]


def _microsoft_token_store_path() -> Path:
    return _weekly_report_generated_dir() / "microsoft_accounts.json"


def _microsoft_state_store_path() -> Path:
    return _weekly_report_generated_dir() / "microsoft_oauth_states.json"


def _weekly_report_generated_dir() -> Path:
    path = _project_root() / "generated" / "weekly_reports"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _save_pending_oauth_state(state: str) -> None:
    state_store = _load_json_file(_microsoft_state_store_path())
    state_store[state] = {"created_at": datetime.now(timezone.utc).isoformat()}
    _save_json_file(_microsoft_state_store_path(), state_store)


def _consume_pending_oauth_state(state: str) -> bool:
    state_store = _load_json_file(_microsoft_state_store_path())
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

    _save_json_file(_microsoft_state_store_path(), fresh_states)
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
