from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Book, Highlight
from app.schemas import BookSummary
from app.services.kindle import parse_clippings, group_by_book

router = APIRouter(prefix="/api/kindle", tags=["kindle"])


@router.post("/import", response_model=list[BookSummary])
async def import_kindle_clippings(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Import highlights from a Kindle 'My Clippings.txt' file.

    Creates books and highlights for each entry found.
    Skips bookmarks (only imports highlights and notes).
    """
    content = (await file.read()).decode("utf-8", errors="replace")
    clippings = parse_clippings(content)
    kindle_books = group_by_book(clippings)

    imported_books = []
    for kb in kindle_books:
        # Check if this book already exists (by title + author)
        stmt = select(Book).where(Book.title == kb.title, Book.author == kb.author)
        result = await db.execute(stmt)
        book = result.scalar_one_or_none()

        if not book:
            book = Book(title=kb.title, author=kb.author, source="kindle")
            db.add(book)
            await db.flush()

        # Get existing highlight texts to avoid duplicates
        existing_stmt = select(Highlight.text).where(Highlight.book_id == book.id)
        existing_result = await db.execute(existing_stmt)
        existing_texts = {row[0] for row in existing_result.all()}

        added = 0
        for clip in kb.clippings:
            if clip.clipping_type == "bookmark":
                continue
            if clip.text in existing_texts:
                continue
            highlight = Highlight(
                book_id=book.id,
                text=clip.text,
                page_number=clip.page,
                location=clip.location,
                source="kindle",
            )
            # If it's a note, put it in the note field instead
            if clip.clipping_type == "note":
                highlight.text = ""
                highlight.note = clip.text
                highlight.source = "kindle"
            db.add(highlight)
            added += 1

        imported_books.append(
            BookSummary(
                id=book.id,
                title=book.title,
                author=book.author,
                isbn=book.isbn,
                cover_url=book.cover_url,
                source=book.source,
                created_at=book.created_at,
                highlight_count=added,
            )
        )

    await db.commit()
    return imported_books
