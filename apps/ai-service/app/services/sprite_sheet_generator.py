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

import cloudinary
import cloudinary.uploader
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
WHITE_BACKGROUND_GUARD_BRIGHTNESS = 235
WHITE_BACKGROUND_GUARD_SATURATION = 18
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
* Use a high-detail sprite density, as if each source character sprite were 256x256 pixels before being placed on the final sheet
* 256x256-level internal detail is mandatory, not optional
* Avoid the look of giant blocky pixels scaled up too far
* Prefer a crisp, highly detailed sprite look closer to polished modern pixel-art characters than simplified retro sprites
* Push the sprite detail to the level of a polished 256x256 pixel-art character sprite, never lower
* Use enough detail that the sprite feels high-resolution for pixel art, not coarse or simplified
* Make the avatar look cute, charming, and flattering while still preserving the person's recognizable features
* Target the highest-detail pixel-art result possible within this image
* Favor maximum internal detail, clean clustering, and polished finish over simplified or approximate sprite rendering
* The sprite sheet should look premium, deliberate, and production-ready rather than draft quality

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
* Clothing colors must read as continuous, intentional garment shapes rather than noisy broken patches
* Keep the shirt, pants, skirt, jacket, and shoes as coherent color regions with clean seams and clean silhouette edges
* Avoid isolated contrasting pixel clusters or vertical streaks in the crotch, pelvis, or inner-leg area that could read as accidental anatomy
* Lower-body clothing must look like normal fabric folds and seams, never like exposed anatomy or suggestive protrusions
* If a shading detail on clothing could be misread as anatomy, simplify or remove it
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
3. WALKING TOWARD THE RIGHT

Pose enforcement:

* The middle sprite must be a true back view of the same character
* In the back view, the face must not be visible
* The back-view head and torso must clearly face away from the viewer, not sideways and not three-quarter
* Do not generate a left-facing side view
* Do not generate three-quarter angles
* Only one side view is allowed, and it must show the character WALKING TOWARD THE RIGHT
* The side-view sprite must clearly show the character WALKING TOWARD THE RIGHT, with the face/profile and body travel direction pointing to the RIGHT side of the canvas
* The third sprite should read as a character WALKING TOWARD THE RIGHT side of the screen
* Use a gentle walking pose for the third sprite only, with a clear rightward travel read and no ambiguity about direction
* The side-view sprite must not face left, must not look mirrored, and must not be directionally ambiguous
* If the character is holding an object, keep the same handedness and orientation consistent with a character WALKING TOWARD THE RIGHT
* Treat a left-facing side view as incorrect even if the sheet otherwise looks good
* Treat any side view whose nose, face, chest, or gaze points left as a failure
* Treat any mirrored, flipped, or ambiguous side profile as a failure
* Before finalizing, verify again that the third sprite IS WALKING TOWARD THE RIGHT and never toward the left
* If the third sprite is left-facing, discard it and regenerate the sheet
* It is better to regenerate than to return a left-facing third sprite
* If there is any ambiguity, prefer a strict back view for the middle sprite

Constraints:

* All sprites must represent the same character with identical proportions
* No extra poses or variations
* The first and second sprites should remain neutral standing turnaround views
* The third sprite may use a subtle walking pose, but it must still be a clean single-pose turnaround sprite rather than an action scene

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
* Preserve high-quality detail consistently across all three views; do not let one panel become blurrier, flatter, or more approximate than the others

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
* Direction correctness is mandatory: the rightmost sprite must show the character WALKING TOWARD THE RIGHT, never left-facing
* Do not crop or place the outer sprites so close to the image edge that any part of the character is cut off
* Keep extra transparent breathing room on the far left and far right edges of the canvas
* Use a dense sprite scale consistent with a 256x256 source sprite per character, not a blown-up 16x16 or 32x32 sprite
* A 192x192-style result is not acceptable; the sprite must read at a 256x256-quality level
* Anything below 256x256-quality internal detail is unacceptable and should be treated as a failed result
* Do not emulate 16x16, 24x24, 32x32, 48x48, 64x64, 96x96, or 128x128 sprite density
* If there is any ambiguity, choose the more detailed pixel-art interpretation
* If there is any ambiguity, prefer higher internal sprite detail over larger chunky pixels
* If there is any ambiguity about direction, regenerate the pose as an unmistakable character WALKING TOWARD THE RIGHT
* A sheet with a left-facing third sprite is invalid and must not be returned
* Return no sheet rather than a sheet whose third sprite faces left
* Return no sheet rather than a sheet with broken clothing colors or accidental anatomy-like artifacts
* If there is any tradeoff between speed and quality, choose quality
* Avoid coarse, muddy, blurry, low-detail, or rushed-looking pixel art under all circumstances
""".strip()


@dataclass(frozen=True)
class SpriteValidationResult:
    """Structured output from the local + vision validation pass."""

    generated_image_exists: bool
    has_exactly_three_views: bool
    order_is_front_back_right: bool
    back_view_has_no_face: bool
    side_view_faces_right: bool
    same_character_across_views: bool
    clothing_colors_are_coherent: bool
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
            and self.back_view_has_no_face
            and self.side_view_faces_right
            and self.same_character_across_views
            and self.clothing_colors_are_coherent
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
                    back_view_has_no_face=validation.back_view_has_no_face,
                    side_view_faces_right=validation.side_view_faces_right,
                    same_character_across_views=validation.same_character_across_views,
                    clothing_colors_are_coherent=validation.clothing_colors_are_coherent,
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
                            "Inspect the visible person and return JSON only with these keys: "
                            "summary, visible_skin_tone_label, visible_skin_tone_hex, visible_skin_tone_notes. "
                            "The summary must be one concise paragraph for a retro game sprite artist and should describe visible hairstyle, "
                            "clothing, accessories, glasses, facial expression, build if visually obvious, and any object held including "
                            "left or right hand if clear. "
                            "For visible_skin_tone_label, use the most specific visible wording you can justify, such as fair, light neutral, "
                            "light olive, olive, tan, warm beige, warm brown, golden brown, medium brown, rich brown, or deep brown skin tone. "
                            "For visible_skin_tone_hex, provide an approximate representative hex color like #A67C52 based only on the visible skin in the image. "
                            "For visible_skin_tone_notes, briefly mention undertone and confidence, for example warm golden undertone, medium confidence. "
                            "Preserve undertone cues when possible and do not exaggerate or stylize the skin tone. "
                            "Be especially careful with brown skin tones so they are not flattened into overly generic labels. "
                            "Do not infer ethnicity, identity, or other sensitive traits. "
                            "If the expression is ambiguous, describe the person as having a friendly smile."
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

    parsed = _parse_json_object(response.output_text)
    description = _build_character_description_from_extraction(parsed)
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
        back_view_has_no_face=bool(vision_result.get("back_view_has_no_face")),
        side_view_faces_right=bool(vision_result.get("side_view_faces_right")),
        same_character_across_views=bool(vision_result.get("same_character_across_views")),
        clothing_colors_are_coherent=bool(vision_result.get("clothing_colors_are_coherent")),
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
                            "has_exactly_three_views, order_is_front_back_right, back_view_has_no_face, side_view_faces_right, same_character_across_views, clothing_colors_are_coherent, notes. "
                            "Use booleans for the first six keys and an array of short strings for notes. "
                            "Check whether there are exactly three character sprites in a single horizontal row, "
                            "whether the order is front then back then a character WALKING TOWARD THE RIGHT, "
                            "whether the middle sprite is a true back view with no visible face, "
                            "whether the rightmost sprite unmistakably shows the character WALKING TOWARD THE RIGHT rather than toward the left, mirrored, or directionally ambiguous, "
                            "whether all three sprites are the same character with matching proportions, "
                            "and whether the clothing colors and lower-body shading read as coherent garments without accidental anatomy-like artifacts. "
                            "Be strict: mark side_view_faces_right false for any sprite that does not clearly show the character WALKING TOWARD THE RIGHT. "
                            "A false positive is worse than a false negative here. "
                            "If you are not highly confident the rightmost sprite shows the character WALKING TOWARD THE RIGHT, return side_view_faces_right=false. "
                            "If the face, nose, gaze, chest, feet, stride, or held object orientation points left, return side_view_faces_right=false. "
                            "If the side view looks mirrored or could be interpreted either way, return side_view_faces_right=false. "
                            "Do not give the benefit of the doubt to unclear images. "
                            "Mark clothing_colors_are_coherent false if the pants, skirt, jacket, or shirt contain broken color patches, isolated dark or light streaks, or crotch-area shading that could be misread as exposed anatomy or a protrusion."
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
    dominant_border_is_white_like = _is_white_like(dominant_border_color)
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
        if (
            is_background_like
            and dominant_border_is_white_like
            and not _is_white_background_pixel(rgb)
        ):
            is_background_like = False

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


def _is_white_like(rgb: tuple[int, int, int]) -> bool:
    """Return whether a color behaves like a near-white matte background."""

    return _rgb_brightness(rgb) >= WHITE_BACKGROUND_GUARD_BRIGHTNESS and _rgb_saturation(rgb) <= 32


def _is_white_background_pixel(rgb: tuple[int, int, int]) -> bool:
    """Restrict white-background cleanup to very neutral near-white pixels only."""

    return (
        _rgb_brightness(rgb) >= WHITE_BACKGROUND_GUARD_BRIGHTNESS
        and _rgb_saturation(rgb) <= WHITE_BACKGROUND_GUARD_SATURATION
    )


def _rgb_brightness(rgb: tuple[int, int, int]) -> float:
    """Approximate perceived brightness for matte-background heuristics."""

    red, green, blue = rgb
    return (red + green + blue) / 3


def _rgb_saturation(rgb: tuple[int, int, int]) -> int:
    """Simple RGB channel spread heuristic for neutral-background detection."""

    red, green, blue = rgb
    return max(rgb) - min(rgb)


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
    """Return local storage metadata, optionally augmented with Cloudinary."""

    local_record: dict[str, Any] = {
        "storage_backend": "local",
        "relative_path": str(saved_path.relative_to(_project_root())),
        "absolute_path": str(saved_path),
        "db_persisted": False,
        "db_record_id": None,
    }

    if not _cloudinary_is_configured():
        local_record["cloudinary_enabled"] = False
        return local_record

    cloudinary_record = _upload_to_cloudinary(saved_path=saved_path)
    return {
        **local_record,
        "storage_backend": "local+cloudinary",
        "cloudinary_enabled": True,
        "cloudinary": cloudinary_record,
    }


def _cloudinary_is_configured() -> bool:
    """Return whether all required Cloudinary credentials are present."""

    return all(
        os.getenv(variable_name)
        for variable_name in (
            "CLOUDINARY_CLOUD_NAME",
            "CLOUDINARY_API_KEY",
            "CLOUDINARY_API_SECRET",
        )
    )


def _upload_to_cloudinary(*, saved_path: Path) -> dict[str, Any]:
    """Upload a generated sprite PNG to Cloudinary and return asset metadata."""

    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
    api_key = os.getenv("CLOUDINARY_API_KEY")
    api_secret = os.getenv("CLOUDINARY_API_SECRET")

    if not cloud_name or not api_key or not api_secret:
        raise RuntimeError(
            "Cloudinary upload was requested but CLOUDINARY_CLOUD_NAME, "
            "CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET is missing."
        )

    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )

    encoded_image = base64.b64encode(saved_path.read_bytes()).decode("utf-8")
    folder = os.getenv("CLOUDINARY_SPRITE_FOLDER", "agentic-office/sprites")
    public_id = saved_path.stem

    try:
        upload_result = cloudinary.uploader.upload(
            f"data:image/png;base64,{encoded_image}",
            folder=folder,
            public_id=public_id,
            overwrite=True,
            resource_type="image",
        )
    except Exception as exc:
        raise RuntimeError(f"Cloudinary upload failed: {exc}") from exc

    return {
        "asset_id": upload_result.get("asset_id"),
        "public_id": upload_result.get("public_id"),
        "version": upload_result.get("version"),
        "width": upload_result.get("width"),
        "height": upload_result.get("height"),
        "format": upload_result.get("format"),
        "resource_type": upload_result.get("resource_type"),
        "folder": folder,
        "secure_url": upload_result.get("secure_url"),
        "url": upload_result.get("url"),
    }


def _parse_json_object(text: str) -> dict[str, Any]:
    """Best-effort parse of the validator's JSON-only response."""

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return {
            "has_exactly_three_views": False,
            "order_is_front_back_right": False,
            "back_view_has_no_face": False,
            "side_view_faces_right": False,
            "same_character_across_views": False,
            "clothing_colors_are_coherent": False,
            "notes": ["Validator response was not valid JSON."],
        }

    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {
            "has_exactly_three_views": False,
            "order_is_front_back_right": False,
            "back_view_has_no_face": False,
            "side_view_faces_right": False,
            "same_character_across_views": False,
            "clothing_colors_are_coherent": False,
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


def _build_character_description_from_extraction(parsed: dict[str, Any]) -> str:
    """Compose a prompt-ready description from structured vision extraction."""

    summary = _normalize_text(str(parsed.get("summary", "")))
    tone_label = _normalize_text(str(parsed.get("visible_skin_tone_label", "")))
    tone_hex = _normalize_text(str(parsed.get("visible_skin_tone_hex", ""))).upper()
    tone_notes = _normalize_text(str(parsed.get("visible_skin_tone_notes", "")))

    if tone_hex and not re.fullmatch(r"#[0-9A-F]{6}", tone_hex):
        tone_hex = ""

    tone_sentence = ""
    if tone_label and tone_hex and tone_notes:
        tone_sentence = (
            f" Visible skin tone reference: {tone_label} ({tone_hex}); {tone_notes}."
        )
    elif tone_label and tone_hex:
        tone_sentence = f" Visible skin tone reference: {tone_label} ({tone_hex})."
    elif tone_label and tone_notes:
        tone_sentence = f" Visible skin tone reference: {tone_label}; {tone_notes}."
    elif tone_label:
        tone_sentence = f" Visible skin tone reference: {tone_label}."

    return _normalize_text(f"{summary}{tone_sentence}")


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
