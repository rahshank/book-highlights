from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Book
from app.schemas import PublishRequest
from app.services.publishers import (
    publish_to_ghost,
    publish_to_roam,
    format_highlights_as_html,
)

router = APIRouter(prefix="/api/publish", tags=["publish"])


@router.post("")
async def publish_highlights(req: PublishRequest, db: AsyncSession = Depends(get_db)):
    """Publish a book's highlights to Ghost or Roam Research."""
    stmt = select(Book).where(Book.id == req.book_id).options(selectinload(Book.highlights))
    result = await db.execute(stmt)
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    if not book.highlights:
        raise HTTPException(status_code=400, detail="No highlights to publish")

    highlights_data = [
        {
            "text": h.text,
            "note": h.note,
            "page_number": h.page_number,
            "location": h.location,
            "chapter": h.chapter,
        }
        for h in book.highlights
    ]

    title = f"Highlights: {book.title}"
    if book.author:
        title += f" by {book.author}"

    if req.target == "ghost":
        html = format_highlights_as_html(book.title, book.author, highlights_data)
        result = await publish_to_ghost(title, html)
    elif req.target == "roam":
        result = await publish_to_roam(title, highlights_data)
    else:
        raise HTTPException(status_code=400, detail="target must be 'ghost' or 'roam'")

    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])

    return result
