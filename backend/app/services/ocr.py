"""OCR service using Tesseract to extract text from book page photos."""

import pytesseract
from PIL import Image, ImageFilter, ImageEnhance


def preprocess_image(image: Image.Image) -> Image.Image:
    """Enhance a book page photo for better OCR results."""
    # Convert to grayscale
    image = image.convert("L")
    # Increase contrast
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.5)
    # Sharpen
    image = image.filter(ImageFilter.SHARPEN)
    return image


def extract_text_from_image(image_path: str) -> str:
    """Extract text from an image file using Tesseract OCR.

    Applies preprocessing to improve accuracy on book page photos.
    """
    image = Image.open(image_path)
    processed = preprocess_image(image)
    text = pytesseract.image_to_string(processed, lang="eng")
    return text.strip()
