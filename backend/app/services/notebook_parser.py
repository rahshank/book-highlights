"""Parse copy-pasted text from Amazon Kindle Notebook (read.amazon.com/notebook).

When you select and copy highlights from the Kindle Notebook web page,
the pasted text follows this general format:

    Book Title
    Author Name

    Yellow highlight | Page: 42
    The highlighted text from page 42.

    Yellow highlight | Location: 245
    Another piece of highlighted text.

    Note | Location: 245
    A note attached to the previous highlight.

This parser extracts the book metadata and individual highlights from
that pasted text, handling variations in color labels, page/location
markers, and formatting quirks.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


# Matches lines like:
#   "Yellow highlight | Page: 42"
#   "Blue highlight | Location: 245"
#   "Yellow highlight | Page: 42 | Location: 650-652"
#   "Orange highlight | Page 42"
#   "Highlight (Yellow) | Location: 100"
#   "Pink highlight | page: 12"
HIGHLIGHT_PATTERN = re.compile(
    r"^(?:(?:Yellow|Blue|Pink|Orange)\s+highlight|Highlight\s*\((?:Yellow|Blue|Pink|Orange)\))"
    r"\s*\|?\s*(.*)$",
    re.IGNORECASE,
)

# Matches note marker lines like:
#   "Note | Location: 245"
#   "Note - Page: 42"
#   "Note | Page 42"
NOTE_PATTERN = re.compile(
    r"^Note\s*[|\-]\s*(.*)$",
    re.IGNORECASE,
)

# Extract page number from metadata portion
PAGE_PATTERN = re.compile(r"page:?\s*(\d+)", re.IGNORECASE)

# Extract location from metadata portion
LOCATION_PATTERN = re.compile(r"location:?\s*([\d\-]+)", re.IGNORECASE)


@dataclass
class NotebookHighlight:
    text: str
    page: int | None = None
    location: str = ""
    color: str = ""
    note: str = ""


@dataclass
class NotebookParseResult:
    title: str
    author: str
    highlights: list[NotebookHighlight] = field(default_factory=list)


def parse_notebook_paste(text: str, title: str = "", author: str = "") -> NotebookParseResult:
    """Parse copy-pasted text from read.amazon.com/notebook.

    Args:
        text: The raw pasted text from the Kindle Notebook page.
        title: Optional book title override (if user provides it separately).
        author: Optional author override (if user provides it separately).

    Returns:
        NotebookParseResult with extracted title, author, and highlights.
    """
    lines = text.strip().splitlines()
    if not lines:
        return NotebookParseResult(title=title, author=author)

    # --- Extract header (title/author) from preamble ---
    detected_title, detected_author, content_start = _extract_header(lines)

    # User-provided values override detected ones
    final_title = title or detected_title
    final_author = author or detected_author

    # --- Parse highlights and notes ---
    highlights = _parse_entries(lines[content_start:])

    return NotebookParseResult(
        title=final_title,
        author=final_author,
        highlights=highlights,
    )


def _extract_header(lines: list[str]) -> tuple[str, str, int]:
    """Extract book title and author from the preamble before highlights.

    Returns (title, author, index_of_first_highlight_line).
    """
    title = ""
    author = ""
    preamble_lines: list[str] = []

    for i, line in enumerate(lines):
        stripped = line.strip()
        # Stop at first highlight or note marker
        if HIGHLIGHT_PATTERN.match(stripped) or NOTE_PATTERN.match(stripped):
            break
        preamble_lines.append(stripped)
    else:
        # No highlights found at all
        i = len(lines)

    # Filter out empty lines and common noise from the preamble
    clean_preamble = [
        l for l in preamble_lines
        if l and not _is_noise_line(l)
    ]

    if len(clean_preamble) >= 2:
        title = clean_preamble[0]
        author = clean_preamble[1]
        # Strip common "by " prefix from author
        if author.lower().startswith("by "):
            author = author[3:].strip()
    elif len(clean_preamble) == 1:
        title = clean_preamble[0]

    return title, author, i


def _is_noise_line(line: str) -> bool:
    """Check if a line is noise (Amazon UI text, not book metadata)."""
    noise_phrases = [
        "notebook export",
        "your notes and highlights",
        "kindle",
        "free kindle",
        "buy the kindle",
        "last annotated on",
        "annotations",
    ]
    lower = line.lower().strip()
    return any(phrase in lower for phrase in noise_phrases)


def _parse_entries(lines: list[str]) -> list[NotebookHighlight]:
    """Parse highlight and note entries from lines."""
    highlights: list[NotebookHighlight] = []
    current: NotebookHighlight | None = None
    current_type: str = ""  # "highlight" or "note"
    text_lines: list[str] = []

    def _flush():
        nonlocal current, current_type, text_lines
        if current is None:
            return
        joined = "\n".join(text_lines).strip()
        if current_type == "note":
            # Attach note to the previous highlight if possible
            if highlights and not joined == "":
                highlights[-1].note = joined
        else:
            current.text = joined
            if joined:  # skip empty highlights
                highlights.append(current)
        current = None
        text_lines = []

    for line in lines:
        stripped = line.strip()

        # Check for highlight marker
        h_match = HIGHLIGHT_PATTERN.match(stripped)
        if h_match:
            _flush()
            meta = h_match.group(1)
            page, location = _extract_page_location(meta)
            color = _extract_color(stripped)
            current = NotebookHighlight(
                text="",
                page=page,
                location=location,
                color=color,
            )
            current_type = "highlight"
            text_lines = []
            continue

        # Check for note marker
        n_match = NOTE_PATTERN.match(stripped)
        if n_match:
            _flush()
            meta = n_match.group(1)
            page, location = _extract_page_location(meta)
            current = NotebookHighlight(
                text="",
                page=page,
                location=location,
            )
            current_type = "note"
            text_lines = []
            continue

        # Accumulate text for current entry
        if current is not None:
            text_lines.append(line.rstrip())

    # Flush last entry
    _flush()

    return highlights


def _extract_page_location(meta: str) -> tuple[int | None, str]:
    """Extract page number and location from a metadata string."""
    page = None
    location = ""

    page_match = PAGE_PATTERN.search(meta)
    if page_match:
        page = int(page_match.group(1))

    loc_match = LOCATION_PATTERN.search(meta)
    if loc_match:
        location = loc_match.group(1)

    return page, location


def _extract_color(line: str) -> str:
    """Extract highlight color from the marker line."""
    lower = line.lower()
    for color in ("yellow", "blue", "pink", "orange"):
        if color in lower:
            return color
    return ""
