"""Look up book metadata by ISBN using Open Library API with isbnlib fallback."""

from __future__ import annotations

import httpx
import isbnlib


def _lookup_open_library(isbn: str) -> dict | None:
    """Look up book metadata via the Open Library API."""
    try:
        resp = httpx.get(
            f"https://openlibrary.org/isbn/{isbn}.json",
            follow_redirects=True,
            timeout=10,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()

        title = data.get("title", "")
        publish_date = data.get("publish_date", "")
        year = publish_date.split(",")[-1].strip() if publish_date else ""

        # Resolve author names from author keys
        authors = []
        for ref in data.get("authors", []):
            key = ref.get("key", "")
            if key:
                try:
                    a = httpx.get(
                        f"https://openlibrary.org{key}.json", timeout=10
                    ).json()
                    authors.append(a.get("name", ""))
                except Exception:
                    pass

        # Cover image
        covers = data.get("covers", [])
        cover_url = (
            f"https://covers.openlibrary.org/b/id/{covers[0]}-M.jpg"
            if covers
            else ""
        )

        return {
            "title": title,
            "author": ", ".join(authors),
            "publisher": ", ".join(data.get("publishers", [])),
            "year": year,
            "isbn": isbn,
            "cover_url": cover_url,
        }
    except Exception:
        return None


def _lookup_isbnlib(isbn: str) -> dict | None:
    """Fallback lookup using isbnlib."""
    meta = None
    for service in ("default", "openl"):
        try:
            meta = isbnlib.meta(isbn, service=service)
            if meta and meta.get("Title"):
                break
        except Exception:
            continue
    if not meta:
        return None

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


def lookup_isbn(isbn: str) -> dict | None:
    """Look up book metadata by ISBN.

    Returns a dict with title, author, publisher, year, and cover_url,
    or None if the ISBN is not found.
    """
    isbn = isbnlib.canonical(isbn)
    if not isbn:
        return None

    # Try Open Library API first (more reliable), then isbnlib as fallback
    return _lookup_open_library(isbn) or _lookup_isbnlib(isbn)
