"""OCR service using Claude vision API with Tesseract fallback."""

from __future__ import annotations

import base64
import logging
import mimetypes

import anthropic
import cv2
import numpy as np
import pytesseract
from PIL import Image

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


def _preprocess_for_tesseract(image_path: str) -> np.ndarray:
    """Preprocess a book page photo for optimal Tesseract OCR.

    Applies grayscale conversion, resizing, adaptive thresholding,
    and noise removal to produce a clean binary image.
    """
    img = cv2.imread(image_path)

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Resize so the shorter side is at least 2000px (ensures text is large
    # enough for Tesseract — equivalent to ~300 DPI for a typical book page)
    h, w = gray.shape
    min_dim = min(h, w)
    if min_dim < 2000:
        scale = 2000 / min_dim
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    # Adaptive thresholding handles uneven lighting from phone camera flash
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15
    )

    # Light denoise to remove speckles without destroying text
    binary = cv2.medianBlur(binary, 3)

    return binary


def _extract_with_tesseract(image_path: str) -> str:
    """Extract text from an image file using Tesseract OCR with OpenCV preprocessing."""
    processed = _preprocess_for_tesseract(image_path)
    pil_image = Image.fromarray(processed)

    # PSM 6 = assume a single uniform block of text (best for book pages)
    # OEM 3 = default (LSTM neural net)
    custom_config = "--psm 6 --oem 3"
    text = pytesseract.image_to_string(pil_image, lang="eng", config=custom_config)
    print(f"[OCR] Tesseract extracted {len(text.strip())} chars")
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
