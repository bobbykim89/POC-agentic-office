from __future__ import annotations

"""Sprite-sheet generation pipeline for cute office avatars.

The flow is intentionally split into small helpers so we can debug failures
from image extraction, image generation, validation, cleanup, and persistence
as separate stages.
"""

import base64
import json
import os
import re
from collections import deque
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI
from PIL import Image


DEFAULT_VISION_MODEL = "gpt-4.1-mini"
DEFAULT_IMAGE_MODEL = "gpt-image-1"
DEFAULT_IMAGE_QUALITY = "medium"
DEFAULT_IMAGE_STYLE = "natural"
DEFAULT_IMAGE_SIZE = "1536x1024"
DEFAULT_OUTPUT_DIR = "generated/sprites"
DEFAULT_FINAL_SPRITE_HEIGHT = 256
MAX_GENERATION_RETRIES = 3
TRANSPARENCY_ALPHA_THRESHOLD = 12
VERTICAL_CROP_PADDING_PIXELS = 4
GREEN_SCREEN = (0, 255, 0)
SPRITE_PROMPT_TEMPLATE = """
Create a pixel art sprite sheet of a single character.

Character description:
{character_description}

Style:

* Pixel art, retro game aesthetic
* Clean, sharp pixels (no anti-aliasing, no blur)
* Fine-grained pixel art with smaller pixel blocks, not oversized chunky pixels
* Readable at low resolution, but with enough internal detail for the face, glasses, hair, and clothing to read clearly
* Chibi-inspired proportions are preferred: slightly larger head, smaller body, and expressive face
* Use a higher-detail sprite density, as if the source character sprite were around 128x128 to 192x192 pixels before being placed on the final sheet
* Push toward the high end of that range, with a source-sprite feel closer to 192x192 than 128x128
* Avoid the look of giant blocky pixels scaled up too far
* Prefer a crisp, highly detailed sprite look closer to polished modern pixel-art characters than simplified retro sprites
* Push the sprite detail one step higher, closer to a polished 192x192 pixel-art character sprite than a coarse overworld icon
* Use enough detail that the sprite feels high-resolution for pixel art, not coarse or simplified
* Make the avatar look cute, charming, and flattering while still preserving the person's recognizable features

Visual inspiration:

* Classic handheld RPG overworld sprites from Nintendo-era games
* Similar readability goals to old Pokemon-style overworld character sprites
* Closer to high-detail handheld or modern indie pixel-art character fidelity than extremely blocky early-console pixel art
* Clear front, back, and side character turnaround for a retro RPG
* Cute anime-inspired face design with readable eyes and a clear smile
* Aim for enough detail that glasses frames, hair shape, and facial expression remain distinct
* Allow extra pixel detail in the face, hair, hands, and clothing folds as long as the sprite still reads clearly
* Favor a warm, appealing character-design treatment over harsh or awkward facial rendering

Sprite requirements:

* Consistent proportions and design across all sprites
* Neutral standing pose (no animation)
* Clear silhouette
* The face is the highest-priority detail in the design
* Use a slightly oversized head so the face has room for readable detail
* Eyes should be large enough to read clearly in pixel art
* The eyes should include a clearly visible white area or sclera, not just solid black dots
* Keep the eye whites visible even when the character is not wearing glasses
* Use enough pixel density that the face does not collapse into only a few large blocks
* Use a super-chibi face design and omit the nose unless it is absolutely necessary
* Focus the facial design primarily on the eyes and mouth
* Facial features must use crisp pixel clusters, not soft blended shading
* Keep the eyes, mouth, and glasses edges sharp and clean
* Avoid blurry, smudged, airbrushed, or painterly facial rendering
* Use deliberate pixel placement so the face reads clearly at a glance
* The face must be intentionally designed, not abstract or melted-looking
* Use clear pixel-art facial features: readable eyes and a distinct smiling mouth
* The character must be visibly smiling, not neutral, blank, or expressionless
* The smile should be big, cheerful, and easy to read at a glance
* The smile must be clean, balanced, and intentionally designed
* Do not make the mouth lopsided, crooked, blurry, or uneven
* The front-view mouth should use crisp pixel clusters and a symmetrical big smiling shape
* Front view must show the clearest facial detail and an obvious big cheerful smile
* Side view should still suggest a smile in profile if the mouth is visible
* Avoid blank, flat, distorted, asymmetrical, or blob-like faces
* Preserve key appearance details from the description, especially glasses, hairstyle, clothing, and handheld objects
* Keep enough pixel detail to show the glasses shape, eye whites, mouth shape, and hair silhouette cleanly
* Hands and held objects should also have enough pixel detail to read clearly
* Preserve the approximate visible skin tone from the description accurately and do not make it significantly darker or lighter
* Preserve nuanced visible skin tone and undertone details such as fair, light olive, olive, tan, warm beige, medium brown, or deep brown when described
* Do not collapse skin tone into an overly broad category if the description is more specific
* Keep the same skin tone consistently across the front, back, and side sprites
* Treat brown skin tones with extra care and specificity so they do not drift lighter, darker, grayer, or redder than described
* Preserve both depth and undertone when brown skin is described, for example warm brown, golden brown, medium brown, rich brown, or deep brown
* Avoid generic substitutions like simply "tan" or "dark" if the description gives a more precise brown skin tone
* If the description includes a nuanced skin tone, preserve that exact wording rather than simplifying it

Poses (exactly 3):

1. Facing forward (front view)
2. Facing backward (back view)
3. Facing right (side view)

Pose enforcement:

* The middle sprite must be a true back view of the same character
* In the back view, the face must not be visible
* Do not generate a left-facing side view
* Do not generate three-quarter angles
* Only one side view is allowed, and it must face right
* If there is any ambiguity, prefer a strict back view for the middle sprite

Constraints:

* All sprites must represent the same character with identical proportions
* No extra poses or variations

Layout:

* Single horizontal row
* Order: front, back, right
* Equal spacing
* Identical square grid cells
* Leave generous empty margin on the far left and far right sides of the overall sheet
* Keep at least 8 percent transparent margin on the far left and far right edges of the canvas
* Do not let the first or third sprite touch or nearly touch the canvas border
* Keep each character comfortably inside its own cell instead of zooming in too far
* Each sprite should feel like a detailed character sprite, not a tiny low-resolution sprite enlarged to fill the canvas
* Keep the design crisp, but do not over-simplify the internal features
* Treat each character as a polished, detailed sprite rather than a rough low-resolution placeholder

Background:

* Fully transparent background
* No checkerboard pattern
* No shadows or gradients
* If transparency is not possible, use solid green (#00FF00)

Cropping:

* Tightly cropped to character bounds
* Minimal empty space
* Character fills most of each grid cell

Output:

* One clean sprite sheet image
* Exactly 3 sprites only
* Leave a small transparent margin around the outer edges so no sprite is clipped at the left or right side
* Prioritize facial readability over tiny decorative details
* If there is any tradeoff between body detail and face detail, prioritize the face
* Do not crop or place the outer sprites so close to the image edge that any part of the character is cut off
* Keep extra transparent breathing room on the far left and far right edges of the canvas
* Use a denser sprite scale closer to a 192x192 source sprite per character, not a blown-up 16x16 or 32x32 sprite
* Do not emulate 16x16, 24x24, or 32x32 sprite density
* If there is any ambiguity, choose the more detailed pixel-art interpretation
* If there is any ambiguity, prefer higher internal sprite detail over larger chunky pixels
""".strip()


@dataclass(frozen=True)
class SpriteValidationResult:
    """Structured output from the local + vision validation pass."""

    generated_image_exists: bool
    has_exactly_three_views: bool
    order_is_front_back_right: bool
    same_character_across_views: bool
    transparent_background: bool
    transparency_fixed: bool
    validator_model: str
    notes: list[str]

    @property
    def passed(self) -> bool:
        return (
            self.generated_image_exists
            and self.has_exactly_three_views
            and self.order_is_front_back_right
            and self.same_character_across_views
            and self.transparent_background
        )


@dataclass(frozen=True)
class SpriteSheetResult:
    """Final saved result returned to the API layer."""

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
    validation: SpriteValidationResult
    storage_record: dict[str, Any]


def generate_character_sprite_sheet(
    *,
    description: str | None,
    image_bytes: bytes | None,
    image_mime_type: str | None,
) -> SpriteSheetResult:
    """Generate, validate, clean, and save a sprite sheet.

    This function is the orchestration layer for the whole sprite pipeline:
    normalize input, optionally extract a description from an image, generate
    the sheet, validate it, retry when needed, then save the successful result.
    """

    client = _build_client()

    if not description and not image_bytes:
        raise RuntimeError("Provide either a description or an image.")

    if description:
        character_description = _sanitize_character_description(_normalize_text(description))
        input_kind = "description"
    else:
        if image_bytes is None or image_mime_type is None:
            raise RuntimeError("Image input is incomplete.")
        character_description = _sanitize_character_description(
            _extract_character_description(
                client=client,
                image_bytes=image_bytes,
                image_mime_type=image_mime_type,
            )
        )
        input_kind = "image"

    retry_notes: list[str] = []
    output_dir = _resolve_output_dir()

    for attempt in range(1, MAX_GENERATION_RETRIES + 1):
        prompt = _build_generation_prompt(character_description, retry_notes)
        sprite_bytes = _generate_sprite_sheet_image(client=client, prompt=prompt)

        validation = _validate_sprite_sheet(
            client=client,
            image_bytes=sprite_bytes,
            image_mime_type="image/png",
        )

        transparency_fixed = False
        if not validation.transparent_background:
            # Only remove background colors connected to the border so we do not
            # accidentally punch holes through internal details like eye whites.
            cleaned_bytes = _attempt_background_removal(sprite_bytes)
            if cleaned_bytes != sprite_bytes:
                transparency_fixed = True
                validation = _validate_sprite_sheet(
                    client=client,
                    image_bytes=cleaned_bytes,
                    image_mime_type="image/png",
                    transparency_fixed=True,
                )
                sprite_bytes = cleaned_bytes

        if validation.passed:
            # We keep the full horizontal canvas and only trim vertical dead
            # space so the outer sprites do not get clipped.
            cropped_sprite_bytes = _crop_outer_empty_space(sprite_bytes)
            final_sprite_bytes = _maybe_rescale_sprite_sheet(cropped_sprite_bytes)
            image_width, image_height = _get_image_dimensions(final_sprite_bytes)
            saved_path = _save_sprite_sheet(
                output_dir=output_dir,
                character_description=character_description,
                image_bytes=final_sprite_bytes,
            )
            storage_record = _build_storage_record(saved_path)
            return SpriteSheetResult(
                character_description=character_description,
                input_kind=input_kind,
                file_name=saved_path.name,
                relative_image_path=str(saved_path.relative_to(_project_root())),
                absolute_image_path=str(saved_path),
                image_width=image_width,
                image_height=image_height,
                final_sprite_height=_final_sprite_height(),
                generation_attempts=attempt,
                generation_model=_image_model(),
                validation=SpriteValidationResult(
                    generated_image_exists=validation.generated_image_exists,
                    has_exactly_three_views=validation.has_exactly_three_views,
                    order_is_front_back_right=validation.order_is_front_back_right,
                    same_character_across_views=validation.same_character_across_views,
                    transparent_background=validation.transparent_background,
                    transparency_fixed=transparency_fixed or validation.transparency_fixed,
                    validator_model=validation.validator_model,
                    notes=validation.notes,
                ),
                storage_record=storage_record,
            )

        retry_notes = validation.notes

    raise RuntimeError(
        "Sprite generation failed after 3 attempts. The latest validation notes were: "
        + "; ".join(retry_notes or ["unknown validation failure"])
    )


def validation_to_dict(validation: SpriteValidationResult) -> dict[str, Any]:
    """Convert validation dataclass output into API-friendly JSON."""

    data = asdict(validation)
    data["passed"] = validation.passed
    return data


def _build_client() -> OpenAI:
    """Build a local OpenAI client from the service .env."""

    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured. Add it to apps/ai-service/.env before calling this endpoint."
        )
    return OpenAI(api_key=api_key)


def _extract_character_description(
    *,
    client: OpenAI,
    image_bytes: bytes,
    image_mime_type: str,
) -> str:
    """Extract a generation-ready character description from a user image."""

    encoded_image = base64.b64encode(image_bytes).decode("utf-8")
    response = client.responses.create(
        model=_vision_model(),
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Describe the visible person for a retro game sprite artist. "
                            "Focus on visible hairstyle, approximate visible skin tone, clothing, accessories, glasses, facial expression, "
                            "build if visually obvious, and any object held including left or right hand if clear. "
                            "Use the most specific visible skin tone wording you can justify, such as fair, light neutral, light olive, olive, tan, warm beige, warm brown, golden brown, medium brown, rich brown, or deep brown skin tone. "
                            "Preserve undertone cues when possible and do not exaggerate or stylize the skin tone. "
                            "Be especially careful with brown skin tones so they are not flattened into overly generic labels. "
                            "If a nuanced brown skin tone is visible, keep that nuance in the wording instead of simplifying it. "
                            "If the expression is ambiguous, default to describing the person as having a friendly smile. "
                            "Do not infer ethnicity, identity, or other sensitive traits. "
                            "Return one concise paragraph only."
                        ),
                    },
                    {
                        "type": "input_image",
                        "image_url": f"data:{image_mime_type};base64,{encoded_image}",
                    },
                ],
            }
        ],
    )

    description = _normalize_text(response.output_text)
    if not description:
        raise RuntimeError("Failed to extract a character description from the uploaded image.")
    return description


def _generate_sprite_sheet_image(*, client: OpenAI, prompt: str) -> bytes:
    """Generate the raw sprite-sheet image bytes from the current prompt."""

    model = _image_model()

    request: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "size": _image_size(),
    }

    if model == "dall-e-3":
        request["quality"] = _image_quality()
        request["style"] = _image_style()
        request["response_format"] = "b64_json"
    else:
        request["quality"] = _image_quality()
        request["background"] = "transparent"

    response = client.images.generate(**request)

    image_base64 = response.data[0].b64_json
    if not image_base64:
        raise RuntimeError("Image generation returned no image data.")
    return base64.b64decode(image_base64)


def _validate_sprite_sheet(
    *,
    client: OpenAI,
    image_bytes: bytes,
    image_mime_type: str,
    transparency_fixed: bool = False,
) -> SpriteValidationResult:
    """Run local transparency checks plus a vision-model layout check."""

    generated_image_exists = bool(image_bytes)
    transparent_background = _has_transparent_background(image_bytes)

    vision_result = _vision_validate_sprite_sheet(
        client=client,
        image_bytes=image_bytes,
        image_mime_type=image_mime_type,
    )

    notes = vision_result.get("notes", [])
    if not transparent_background:
        notes = [*notes, "The background is not transparent enough around the border."]

    return SpriteValidationResult(
        generated_image_exists=generated_image_exists,
        has_exactly_three_views=bool(vision_result.get("has_exactly_three_views")),
        order_is_front_back_right=bool(vision_result.get("order_is_front_back_right")),
        same_character_across_views=bool(vision_result.get("same_character_across_views")),
        transparent_background=transparent_background,
        transparency_fixed=transparency_fixed,
        validator_model=_vision_model(),
        notes=notes,
    )


def _vision_validate_sprite_sheet(
    *,
    client: OpenAI,
    image_bytes: bytes,
    image_mime_type: str,
) -> dict[str, Any]:
    """Use a vision model to judge pose count/order/character consistency."""

    encoded_image = base64.b64encode(image_bytes).decode("utf-8")
    response = client.responses.create(
        model=_vision_model(),
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Inspect this sprite sheet and return JSON only with these keys: "
                            "has_exactly_three_views, order_is_front_back_right, same_character_across_views, notes. "
                            "Use booleans for the first three keys and an array of short strings for notes. "
                            "Check whether there are exactly three character sprites in a single horizontal row, "
                            "whether the order is front then back then right-facing side view, "
                            "and whether all three sprites are the same character with matching proportions."
                        ),
                    },
                    {
                        "type": "input_image",
                        "image_url": f"data:{image_mime_type};base64,{encoded_image}",
                    },
                ],
            }
        ],
    )

    return _parse_json_object(response.output_text)


def _attempt_background_removal(image_bytes: bytes) -> bytes:
    """Remove border-connected background colors while preserving internals."""

    image = Image.open(BytesIO(image_bytes)).convert("RGBA")
    width, height = image.size
    pixels = image.load()
    border_pixels = _sample_border_pixels(image)
    dominant_border_color = _dominant_color(border_pixels)
    visited: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))

    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in visited:
            continue
        visited.add((x, y))

        red, green, blue, alpha = pixels[x, y]
        if alpha == 0:
            continue

        rgb = (red, green, blue)
        is_background_like = _is_near_color(rgb, GREEN_SCREEN, tolerance=35) or _is_near_color(
            rgb, dominant_border_color, tolerance=28
        )

        if not is_background_like:
            continue

        pixels[x, y] = (red, green, blue, 0)

        for next_x, next_y in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= next_x < width and 0 <= next_y < height and (next_x, next_y) not in visited:
                queue.append((next_x, next_y))

    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _crop_outer_empty_space(image_bytes: bytes) -> bytes:
    """Trim vertical dead space aggressively while preserving full width."""

    image = Image.open(BytesIO(image_bytes)).convert("RGBA")
    alpha_channel = image.getchannel("A")
    bounding_box = alpha_channel.point(
        lambda alpha: 255 if alpha > TRANSPARENCY_ALPHA_THRESHOLD else 0
    ).getbbox()

    if bounding_box is None:
        return image_bytes

    left, upper, right, lower = bounding_box
    upper = max(0, upper - VERTICAL_CROP_PADDING_PIXELS)
    lower = min(image.height, lower + VERTICAL_CROP_PADDING_PIXELS)

    # Keep the original horizontal canvas to avoid clipping the outer sprites,
    # but tighten the vertical bounds so the final resize normalizes character
    # height more consistently.
    cropped_image = image.crop((0, upper, image.width, lower))
    output = BytesIO()
    cropped_image.save(output, format="PNG")
    return output.getvalue()


def _get_image_dimensions(image_bytes: bytes) -> tuple[int, int]:
    """Read final saved dimensions from image bytes."""

    image = Image.open(BytesIO(image_bytes))
    return image.size


def _maybe_rescale_sprite_sheet(image_bytes: bytes) -> bytes:
    """Resize the final sprite sheet to a fixed height while preserving ratio."""

    target_height = _final_sprite_height()
    if target_height <= 0:
        return image_bytes

    image = Image.open(BytesIO(image_bytes)).convert("RGBA")
    width, height = image.size
    if height == target_height:
        return image_bytes

    target_width = max(1, round(width * (target_height / height)))
    resized_image = image.resize(
        (target_width, target_height),
        resample=Image.Resampling.NEAREST,
    )

    output = BytesIO()
    resized_image.save(output, format="PNG")
    return output.getvalue()


def _has_transparent_background(image_bytes: bytes) -> bool:
    """Check whether the border is mostly transparent and the image has alpha."""

    image = Image.open(BytesIO(image_bytes)).convert("RGBA")
    alpha_channel = image.getchannel("A")
    minimum_alpha, maximum_alpha = alpha_channel.getextrema()
    if minimum_alpha >= 255:
        return False

    border_pixels = _sample_border_pixels(image)
    if not border_pixels:
        return False

    transparent_border_pixels = sum(
        1 for _, _, _, alpha in border_pixels if alpha <= TRANSPARENCY_ALPHA_THRESHOLD
    )
    transparent_ratio = transparent_border_pixels / len(border_pixels)
    return transparent_ratio >= 0.6 and maximum_alpha > TRANSPARENCY_ALPHA_THRESHOLD


def _sample_border_pixels(image: Image.Image) -> list[tuple[int, int, int, int]]:
    """Collect border pixels used by transparency and cleanup heuristics."""

    rgba_image = image.convert("RGBA")
    width, height = rgba_image.size
    coordinates: set[tuple[int, int]] = set()

    for x in range(width):
        coordinates.add((x, 0))
        coordinates.add((x, height - 1))

    for y in range(height):
        coordinates.add((0, y))
        coordinates.add((width - 1, y))

    pixels = rgba_image.load()
    return [pixels[x, y] for x, y in coordinates]


def _dominant_color(border_pixels: list[tuple[int, int, int, int]]) -> tuple[int, int, int]:
    """Approximate the dominant non-transparent border color for cleanup."""

    quantized = [
        (red // 16 * 16, green // 16 * 16, blue // 16 * 16)
        for red, green, blue, alpha in border_pixels
        if alpha > TRANSPARENCY_ALPHA_THRESHOLD
    ]
    if not quantized:
        return GREEN_SCREEN
    return Counter(quantized).most_common(1)[0][0]


def _build_generation_prompt(character_description: str, retry_notes: list[str]) -> str:
    """Combine the base prompt with retry feedback from the validator."""

    prompt = SPRITE_PROMPT_TEMPLATE.format(character_description=character_description)
    if not retry_notes:
        return prompt

    feedback = "\n".join(f"- {note}" for note in retry_notes[:4])
    return (
        f"{prompt}\n\n"
        "Important fixes from the previous attempt:\n"
        f"{feedback}\n"
        "Please correct those issues while keeping the original character design consistent."
    )


def _save_sprite_sheet(*, output_dir: Path, character_description: str, image_bytes: bytes) -> Path:
    """Persist the final image locally with a readable timestamped filename."""

    output_dir.mkdir(parents=True, exist_ok=True)
    slug = _slugify(character_description)[:40] or "character"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    file_path = output_dir / f"{slug}-{timestamp}.png"
    file_path.write_bytes(image_bytes)
    return file_path


def _build_storage_record(saved_path: Path) -> dict[str, Any]:
    """Return placeholder metadata for a future database-backed asset store."""

    return {
        "storage_backend": "local",
        "relative_path": str(saved_path.relative_to(_project_root())),
        "absolute_path": str(saved_path),
        "db_persisted": False,
        "db_record_id": None,
        "todo": "Persist this metadata in the future database layer.",
    }


def _parse_json_object(text: str) -> dict[str, Any]:
    """Best-effort parse of the validator's JSON-only response."""

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return {
            "has_exactly_three_views": False,
            "order_is_front_back_right": False,
            "same_character_across_views": False,
            "notes": ["Validator response was not valid JSON."],
        }

    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {
            "has_exactly_three_views": False,
            "order_is_front_back_right": False,
            "same_character_across_views": False,
            "notes": ["Validator response could not be parsed as JSON."],
        }

    notes = parsed.get("notes")
    if not isinstance(notes, list):
        parsed["notes"] = ["Validator did not provide structured notes."]
    else:
        parsed["notes"] = [str(note) for note in notes]
    return parsed


def _normalize_text(text: str) -> str:
    """Collapse repeated whitespace so prompt text stays compact and stable."""

    return re.sub(r"\s+", " ", text).strip()


def _sanitize_character_description(text: str) -> str:
    """Normalize risky phrasing without losing appearance-defining details."""

    sanitized = text

    replacements = (
        (r"\bwhite woman\b", "woman"),
        (r"\bslim build\b", "average build"),
        (r"\bsleeveless top\b", "modest top"),
        (r"\btank top\b", "modest top"),
        (r"\bcrop top\b", "modest top"),
        (r"\bcleavage\b", "upper clothing"),
        (r"\bsexy\b", "professional"),
    )

    for pattern, replacement in replacements:
        sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)

    sanitized = _normalize_text(sanitized)

    if not re.search(
        r"\b(fair|light(?: neutral| olive)?|olive|tan|warm beige|warm brown|golden brown|medium brown|rich brown|deep brown|dark)\s+skin tone\b",
        sanitized,
        flags=re.IGNORECASE,
    ):
        sanitized = re.sub(
            r"\b(fair|light(?: neutral| olive)?|olive|tan|warm beige|warm brown|golden brown|medium brown|rich brown|deep brown|dark)\s+skin\b",
            lambda match: f"{match.group(1).lower()} skin tone",
            sanitized,
            flags=re.IGNORECASE,
        )

    if re.search(r"\bmedium skin tone\b", sanitized, flags=re.IGNORECASE) and not re.search(
        r"\b(warm brown|golden brown|medium brown|rich brown)\s+skin tone\b",
        sanitized,
        flags=re.IGNORECASE,
    ):
        sanitized = re.sub(
            r"\bmedium skin tone\b",
            "medium brown skin tone",
            sanitized,
            flags=re.IGNORECASE,
        )

    if "professional office clothes" not in sanitized.lower():
        sanitized = (
            f"{sanitized} The person is dressed in professional office clothes with a non-sexual character design."
        )

    if not re.search(r"\b(smile|smiling)\b", sanitized, flags=re.IGNORECASE):
        sanitized = f"{sanitized} The person has a friendly smile."

    return sanitized


def _slugify(text: str) -> str:
    """Create a filesystem-safe filename slug from descriptive text."""

    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _is_near_color(
    first_color: tuple[int, int, int],
    second_color: tuple[int, int, int],
    *,
    tolerance: int,
) -> bool:
    """Simple RGB distance heuristic used by local background cleanup."""

    return sum(abs(first - second) for first, second in zip(first_color, second_color)) <= tolerance


def _vision_model() -> str:
    return os.getenv("OPENAI_VISION_MODEL", DEFAULT_VISION_MODEL)


def _image_model() -> str:
    return os.getenv("OPENAI_IMAGE_MODEL", DEFAULT_IMAGE_MODEL)


def _image_quality() -> str:
    return os.getenv("OPENAI_IMAGE_QUALITY", DEFAULT_IMAGE_QUALITY)


def _image_style() -> str:
    return os.getenv("OPENAI_IMAGE_STYLE", DEFAULT_IMAGE_STYLE)


def _image_size() -> str:
    return os.getenv("OPENAI_IMAGE_SIZE", DEFAULT_IMAGE_SIZE)


def _final_sprite_height() -> int:
    raw_value = os.getenv("FINAL_SPRITE_HEIGHT")
    if raw_value is None:
        return DEFAULT_FINAL_SPRITE_HEIGHT

    try:
        parsed = int(raw_value)
    except ValueError:
        return DEFAULT_FINAL_SPRITE_HEIGHT

    return max(1, parsed)


def _resolve_output_dir() -> Path:
    """Resolve the output directory relative to the ai-service project root."""

    configured = os.getenv("SPRITE_OUTPUT_DIR", DEFAULT_OUTPUT_DIR)
    return _project_root() / configured


def _project_root() -> Path:
    """Return the apps/ai-service directory for local asset saves."""

    return Path(__file__).resolve().parents[2]
