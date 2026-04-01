from __future__ import annotations

"""Simple AI-news workflow.

This service fetches a small set of recent AI-related news items from a public
RSS feed, randomly chooses one, and asks OpenAI for a short plain-language
summary suitable for the playful office app.
"""

import email.utils
import os
import random
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta

from dotenv import load_dotenv
from openai import OpenAI


DEFAULT_NEWS_MODEL = "gpt-5-mini"
DEFAULT_NEWS_QUERY = "AI OR artificial intelligence OR OpenAI OR Anthropic OR Gemini"
DEFAULT_NEWS_FEED_LANGUAGE = "en-US"
DEFAULT_NEWS_FEED_REGION = "US"
DEFAULT_NEWS_LOOKBACK_HOURS = 36
DEFAULT_NEWS_FEED_LIMIT = 40
DEFAULT_NEWS_FEED_PROVIDER = "google"
DEFAULT_NEWS_RANDOM_POOL_SIZE = 20
_RANDOM = random.SystemRandom()
_TOPIC_STOPWORDS = {
    "ai",
    "artificial",
    "intelligence",
    "latest",
    "today",
    "news",
    "report",
    "reports",
    "new",
    "says",
    "say",
    "amid",
    "after",
    "over",
    "from",
    "with",
    "into",
    "about",
    "how",
    "why",
    "what",
    "the",
    "and",
    "for",
    "that",
    "this",
    "their",
    "its",
}


@dataclass(frozen=True)
class AINewsResult:
    title: str
    source: str
    published_at: str
    article_url: str
    paragraph: str
    model: str


@dataclass(frozen=True)
class _NewsItem:
    title: str
    source: str
    published_at: datetime
    article_url: str
    snippet: str


def get_random_ai_news_summary() -> AINewsResult:
    """Fetch a recent AI news item and summarize it in simple language."""

    client = _build_client()
    items = _fetch_ai_news_items()
    chosen_item = _pick_news_item(items)
    summary = _summarize_news_item(client=client, item=chosen_item)

    paragraph = (
        f"According to the latest AI news, {summary} Fascinating."
    )

    return AINewsResult(
        title=chosen_item.title,
        source=chosen_item.source,
        published_at=chosen_item.published_at.isoformat(),
        article_url=chosen_item.article_url,
        paragraph=paragraph,
        model=_news_model(),
    )


def _build_client() -> OpenAI:
    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured. Add it to apps/ai-service/.env before calling this endpoint."
        )
    return OpenAI(api_key=api_key)


def _fetch_ai_news_items() -> list[_NewsItem]:
    """Read AI-related articles from a public news RSS search feed."""

    with urllib.request.urlopen(_news_feed_url(), timeout=15) as response:
        xml_bytes = response.read()

    root = ET.fromstring(xml_bytes)
    channel = root.find("channel")
    if channel is None:
        raise RuntimeError("AI news feed returned an unexpected response.")

    items: list[_NewsItem] = []
    for item in channel.findall("item"):
        title = _text_or_empty(item.find("title"))
        link = _text_or_empty(item.find("link"))
        source = _text_or_empty(item.find("source")) or "Unknown source"
        pub_date = _parse_rss_datetime(_text_or_empty(item.find("pubDate")))
        snippet = _strip_html(_text_or_empty(item.find("description")))

        if not title or not link or pub_date is None:
            continue

        items.append(
            _NewsItem(
                title=title,
                source=source,
                published_at=pub_date,
                article_url=link,
                snippet=snippet,
            )
        )

    if not items:
        raise RuntimeError("No AI news items were found in the feed.")

    return items[: _news_feed_limit()]


def _pick_news_item(items: list[_NewsItem]) -> _NewsItem:
    """Prefer articles from today, then pick randomly from the top-ranked pool."""

    now = datetime.now().astimezone()
    today_items = [item for item in items if item.published_at.astimezone().date() == now.date()]
    if today_items:
        return _pick_from_top_pool(today_items)

    cutoff = now - timedelta(hours=_news_lookback_hours())
    recent_items = [item for item in items if item.published_at.astimezone() >= cutoff]
    if recent_items:
        return _pick_from_top_pool(recent_items)

    return _pick_from_top_pool(items)


def _pick_from_top_pool(items: list[_NewsItem]) -> _NewsItem:
    """Pick randomly from the top-ranked pool after topic diversification."""

    ranked_pool = items[: min(len(items), _news_random_pool_size())]
    diverse_pool = _build_diverse_pool(ranked_pool)
    return _RANDOM.choice(diverse_pool or ranked_pool)


def _build_diverse_pool(items: list[_NewsItem]) -> list[_NewsItem]:
    """Collapse near-duplicate headlines so one story does not dominate the pool."""

    diverse_items: list[_NewsItem] = []
    seen_signatures: list[set[str]] = []

    for item in items:
        signature = _topic_signature(item)
        if not signature:
            diverse_items.append(item)
            continue

        if any(_signature_overlap(signature, existing) >= 0.5 for existing in seen_signatures):
            continue

        diverse_items.append(item)
        seen_signatures.append(signature)

    return diverse_items


def _topic_signature(item: _NewsItem) -> set[str]:
    """Extract a lightweight topic signature from the title and snippet."""

    text = f"{item.title} {item.snippet}".lower()
    tokens = {
        token
        for token in re.findall(r"[a-z0-9]{3,}", text)
        if token not in _TOPIC_STOPWORDS
    }
    return tokens


def _signature_overlap(first: set[str], second: set[str]) -> float:
    """Measure how similar two topic signatures are."""

    if not first or not second:
        return 0.0

    intersection = len(first & second)
    union = len(first | second)
    if union == 0:
        return 0.0

    return intersection / union


def _summarize_news_item(*, client: OpenAI, item: _NewsItem) -> str:
    """Summarize the chosen article into a short plain-language blurb."""

    extra_context = item.snippet or "No extra article snippet was available."

    response = client.responses.create(
        model=_news_model(),
        reasoning={"effort": "minimal"},
        instructions=(
            "You explain AI news in plain English. Write a short, easy-to-understand summary with a bit of context, "
            "not just a paraphrase of the headline. Avoid hype, jargon, and speculation."
        ),
        input=(
            "Summarize this AI news item for a general audience in 2 short sentences max. "
            "Explain the gist and why it matters in simple terms. "
            "Do not mention the source name unless needed for clarity.\n\n"
            f"Headline: {item.title}\n"
            f"Snippet: {extra_context}\n"
            f"Source: {item.source}\n"
            f"Published: {item.published_at.isoformat()}\n"
            f"URL: {item.article_url}"
        ),
        max_output_tokens=140,
    )

    summary = " ".join(response.output_text.strip().split())
    if not summary:
        raise RuntimeError("OpenAI returned an empty AI news summary.")

    return summary.rstrip(".!?") + "."


def _news_feed_url() -> str:
    query = urllib.parse.quote(f"{_news_query()} when:1d")
    language = urllib.parse.quote(_news_feed_language())
    region = urllib.parse.quote(_news_feed_region())

    if _news_feed_provider() == "bing":
        return f"https://www.bing.com/news/search?q={query}&setlang={language}&cc={region}&format=rss"

    # Google News RSS search is more reliable for this lightweight prototype.
    return (
        "https://news.google.com/rss/search"
        f"?q={query}&hl={language}&gl={region}&ceid={region}:en"
    )


def _parse_rss_datetime(value: str) -> datetime | None:
    if not value:
        return None

    try:
        parsed = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        return None

    if parsed.tzinfo is None:
        return parsed.astimezone()

    return parsed


def _text_or_empty(element: ET.Element | None) -> str:
    return (element.text or "").strip() if element is not None else ""


def _strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value)
    return " ".join(text.split())


def _news_model() -> str:
    return os.getenv("OPENAI_NEWS_MODEL", os.getenv("OPENAI_MODEL", DEFAULT_NEWS_MODEL))


def _news_query() -> str:
    return os.getenv("AI_NEWS_QUERY", DEFAULT_NEWS_QUERY)


def _news_feed_language() -> str:
    return os.getenv("AI_NEWS_FEED_LANGUAGE", DEFAULT_NEWS_FEED_LANGUAGE)


def _news_feed_region() -> str:
    return os.getenv("AI_NEWS_FEED_REGION", DEFAULT_NEWS_FEED_REGION)


def _news_lookback_hours() -> int:
    raw_value = os.getenv("AI_NEWS_LOOKBACK_HOURS")
    if raw_value is None:
        return DEFAULT_NEWS_LOOKBACK_HOURS

    try:
        return max(1, int(raw_value))
    except ValueError:
        return DEFAULT_NEWS_LOOKBACK_HOURS


def _news_feed_limit() -> int:
    raw_value = os.getenv("AI_NEWS_FEED_LIMIT")
    if raw_value is None:
        return DEFAULT_NEWS_FEED_LIMIT

    try:
        return max(_news_random_pool_size(), int(raw_value))
    except ValueError:
        return DEFAULT_NEWS_FEED_LIMIT


def _news_feed_provider() -> str:
    provider = os.getenv("AI_NEWS_FEED_PROVIDER", DEFAULT_NEWS_FEED_PROVIDER).strip().lower()
    return provider if provider in {"google", "bing"} else DEFAULT_NEWS_FEED_PROVIDER


def _news_random_pool_size() -> int:
    raw_value = os.getenv("AI_NEWS_RANDOM_POOL_SIZE")
    if raw_value is None:
        return DEFAULT_NEWS_RANDOM_POOL_SIZE

    try:
        return max(1, int(raw_value))
    except ValueError:
        return DEFAULT_NEWS_RANDOM_POOL_SIZE
