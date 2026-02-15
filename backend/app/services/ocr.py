"""OCR service using Claude vision API with Tesseract fallback."""

from __future__ import annotations

import base64
import logging
import mimetypes

import anthropic
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter

from app.config import ANTHROPIC_API_KEY

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are an OCR transcription engine for a personal reading tracker app. "
    "The user photographs pages from published books they own so they can save "
    "highlights and quotations for personal study. Accurately transcribe the "
    "printed text visible in the photograph. This is a purely mechanical "
    "transcription task — reproduce the text exactly as printed."
)

VISION_PROMPT = (
    "Perform OCR on this photograph of a printed book page. "
    "Return ONLY the transcribed text, preserving paragraph breaks. "
    "If there are highlighted or underlined passages, wrap each one in **bold**. "
    "Do not add commentary, headers, or explanations — just the verbatim text."
)

MODELS = [
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
]


def _call_claude(client: anthropic.Anthropic, model: str, image_data: str, mime_type: str) -> str | None:
    """Make a single Claude Vision API call. Returns text or None."""
    message = client.messages.create(
        model=model,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime_type,
                            "data": image_data,
                        },
                    },
                    {"type": "text", "text": VISION_PROMPT},
                ],
            }
        ],
    )
    text = message.content[0].text.strip()
    return text if text else None


def _extract_with_claude(image_path: str) -> str | None:
    """Extract text from an image using the Claude vision API.

    Tries multiple models — if one is blocked by the content filter,
    falls back to the next before giving up.
    """
    if not ANTHROPIC_API_KEY:
        print("[OCR] ANTHROPIC_API_KEY is not set — skipping Claude Vision")
        return None

    mime_type = mimetypes.guess_type(image_path)[0] or "image/jpeg"
    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    for model in MODELS:
        try:
            print(f"[OCR] Trying Claude Vision with {model}...")
            text = _call_claude(client, model, image_data, mime_type)
            if text:
                print(f"[OCR] {model} succeeded ({len(text)} chars)")
                return text
        except anthropic.BadRequestError as exc:
            print(f"[OCR] {model} blocked by content filter: {exc}")
            continue
        except Exception as exc:
            print(f"[OCR] {model} failed: {exc}")
            continue

    print("[OCR] All Claude models failed")
    return None


def _preprocess_image(image: Image.Image) -> Image.Image:
    """Enhance a book page photo for better Tesseract OCR results."""
    image = image.convert("L")
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.5)
    image = image.filter(ImageFilter.SHARPEN)
    return image


def _extract_with_tesseract(image_path: str) -> str:
    """Extract text from an image file using Tesseract OCR."""
    image = Image.open(image_path)
    processed = _preprocess_image(image)
    text = pytesseract.image_to_string(processed, lang="eng")
    return text.strip()


def extract_text_from_image(image_path: str) -> str:
    """Extract text from a book page image.

    Uses Claude vision API for high-quality results, falling back to
    Tesseract OCR if the API key is not configured or the call fails.
    """
    result = _extract_with_claude(image_path)
    if result:
        return result
    return _extract_with_tesseract(image_path)
