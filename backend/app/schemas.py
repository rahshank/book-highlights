from datetime import datetime
from pydantic import BaseModel


# --- Book schemas ---

class BookCreate(BaseModel):
    title: str
    author: str = ""
    isbn: str = ""
    cover_url: str = ""
    publisher: str = ""
    year: str = ""
    source: str = "manual"
    notes: str = ""


class BookUpdate(BaseModel):
    title: str | None = None
    author: str | None = None
    isbn: str | None = None
    cover_url: str | None = None
    publisher: str | None = None
    year: str | None = None
    notes: str | None = None


class HighlightOut(BaseModel):
    id: str
    book_id: str
    text: str
    note: str
    page_number: int | None
    location: str
    chapter: str
    source: str
    source_image: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BookOut(BaseModel):
    id: str
    title: str
    author: str
    isbn: str
    cover_url: str
    publisher: str
    year: str
    source: str
    created_at: datetime
    notes: str
    highlights: list[HighlightOut] = []

    model_config = {"from_attributes": True}


class BookSummary(BaseModel):
    id: str
    title: str
    author: str
    isbn: str
    cover_url: str
    source: str
    created_at: datetime
    highlight_count: int = 0

    model_config = {"from_attributes": True}


# --- Highlight schemas ---

class HighlightCreate(BaseModel):
    book_id: str
    text: str
    note: str = ""
    page_number: int | None = None
    location: str = ""
    chapter: str = ""
    source: str = "manual"
    source_image: str = ""


class HighlightUpdate(BaseModel):
    text: str | None = None
    note: str | None = None
    page_number: int | None = None
    location: str | None = None
    chapter: str | None = None


# --- Search ---

class SearchResult(BaseModel):
    highlight: HighlightOut
    book_title: str
    book_author: str


# --- OCR ---

class ScanResult(BaseModel):
    text: str
    source_image: str


# --- Publishing ---

class PublishRequest(BaseModel):
    book_id: str
    target: str  # "ghost" or "roam"
