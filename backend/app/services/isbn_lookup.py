"""Look up book metadata by ISBN using isbnlib."""

from __future__ import annotations

import isbnlib


def lookup_isbn(isbn: str) -> dict | None:
    """Look up book metadata by ISBN.

    Returns a dict with title, author, publisher, year, and cover_url,
    or None if the ISBN is not found.
    """
    isbn = isbnlib.canonical(isbn)
    if not isbn:
        return None

    meta = isbnlib.meta(isbn, service="default")
    if not meta:
        return None

    # Try to get cover image
    cover_url = ""
    try:
        covers = isbnlib.cover(isbn)
        if covers:
            cover_url = covers.get("thumbnail", "") or covers.get("smallThumbnail", "")
    except Exception:
        pass

    authors = meta.get("Authors", [])
    return {
        "title": meta.get("Title", ""),
        "author": ", ".join(authors) if authors else "",
        "publisher": meta.get("Publisher", ""),
        "year": meta.get("Year", ""),
        "isbn": isbn,
        "cover_url": cover_url,
    }
