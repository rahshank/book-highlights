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

VISION_PROMPT = (
    "Extract the text from this book page photo. "
    "Return ONLY the extracted text, preserving paragraph breaks. "
    "If there are highlighted or underlined passages, wrap each one in **bold**. "
    "Do not add commentary, headers, or explanations — just the text."
)


def _extract_with_claude(image_path: str) -> str | None:
    """Extract text from an image using the Claude vision API."""
    if not ANTHROPIC_API_KEY:
        return None
    try:
        mime_type = mimetypes.guess_type(image_path)[0] or "image/jpeg"
        with open(image_path, "rb") as f:
            image_data = base64.standard_b64encode(f.read()).decode("utf-8")

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=4096,
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
    except Exception:
        logger.exception("Claude vision OCR failed, falling back to Tesseract")
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
