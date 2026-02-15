"""Parse Kindle 'My Clippings.txt' files into structured highlights.

The My Clippings.txt format looks like:

    Book Title (Author Name)
    - Your Highlight on page 42 | location 650-652 | Added on Monday, January 1, 2024 12:00:00 AM

    The actual highlighted text content goes here.
    ==========

Each clipping is separated by "==========" on its own line.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class KindleClipping:
    book_title: str
    author: str
    text: str
    page: int | None = None
    location: str = ""
    clipping_type: str = "highlight"  # highlight, note, bookmark


@dataclass
class KindleBook:
    title: str
    author: str
    clippings: list[KindleClipping] = field(default_factory=list)


def parse_clippings(content: str) -> list[KindleClipping]:
    """Parse the full content of a My Clippings.txt file."""
    clippings = []
    blocks = content.split("==========")

    for block in blocks:
        block = block.strip()
        if not block:
            continue
        lines = block.split("\n")
        if len(lines) < 3:
            continue

        # Line 1: "Book Title (Author Name)"
        title_line = lines[0].strip()
        title, author = _parse_title_author(title_line)

        # Line 2: metadata "- Your Highlight on page X | location Y | Added on ..."
        meta_line = lines[1].strip()
        page, location, clipping_type = _parse_metadata(meta_line)

        # Lines 3+: the actual text (skip blank line after metadata)
        text_lines = [l for l in lines[2:] if l.strip()]
        text = "\n".join(text_lines).strip()

        if not text and clipping_type == "highlight":
            continue  # skip empty highlights

        clippings.append(
            KindleClipping(
                book_title=title,
                author=author,
                text=text,
                page=page,
                location=location,
                clipping_type=clipping_type,
            )
        )
    return clippings


def group_by_book(clippings: list[KindleClipping]) -> list[KindleBook]:
    """Group clippings by book title + author."""
    books: dict[str, KindleBook] = {}
    for clip in clippings:
        key = f"{clip.book_title}||{clip.author}"
        if key not in books:
            books[key] = KindleBook(title=clip.book_title, author=clip.author)
        books[key].clippings.append(clip)
    return list(books.values())


def _parse_title_author(line: str) -> tuple[str, str]:
    """Extract title and author from 'Title (Author)' format."""
    match = re.match(r"^(.+?)\s*\(([^)]+)\)\s*$", line)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return line.strip(), ""


def _parse_metadata(line: str) -> tuple[int | None, str, str]:
    """Extract page, location, and clipping type from metadata line."""
    page = None
    location = ""
    clipping_type = "highlight"

    if "Your Note" in line or "Your note" in line:
        clipping_type = "note"
    elif "Your Bookmark" in line or "Your bookmark" in line:
        clipping_type = "bookmark"

    page_match = re.search(r"page\s+(\d+)", line, re.IGNORECASE)
    if page_match:
        page = int(page_match.group(1))

    loc_match = re.search(r"location\s+([\d-]+)", line, re.IGNORECASE)
    if loc_match:
        location = loc_match.group(1)

    return page, location, clipping_type
