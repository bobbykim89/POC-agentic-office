from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv
from openai import OpenAI


DEFAULT_MODEL = "gpt-5-mini"
MAX_INPUT_LENGTH = 200

_INSTRUCTIONS = """
You rewrite short user inputs into exaggerated LinkedIn-style posts.

Rules:
- Keep the response to one short paragraph.
- Make ordinary or silly things sound polished, strategic, and mildly self-important.
- End with 2 to 4 relevant hashtags.
- No bullet points.
- No emojis.
- No quotation marks around the final answer.
- Keep it concise and postable.
""".strip()


@dataclass(frozen=True)
class LinkedInWriterResult:
    post: str
    model: str


def generate_linkedin_post_with_openai(text: str) -> LinkedInWriterResult:
    load_dotenv()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured. Add it to apps/ai-service/.env before calling this endpoint."
        )

    model = os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    client = OpenAI(api_key=api_key)

    response = client.responses.create(
        model=model,
        reasoning={"effort": "minimal"},
        instructions=_INSTRUCTIONS,
        input=(
            "Turn this into a short, funny LinkedIn-style post that sounds overly formal and professional "
            f"while staying grounded in the original idea:\n\n{text.strip()}"
        ),
        max_output_tokens=140,
    )

    post = response.output_text.strip()
    if not post:
        raise RuntimeError("OpenAI returned an empty response.")

    return LinkedInWriterResult(post=post, model=model)
