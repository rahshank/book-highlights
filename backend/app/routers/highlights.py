from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
import anthropic

from app.database import get_db
from app.models import Book, Highlight
from app.schemas import HighlightCreate, HighlightUpdate, HighlightOut, SearchResult
from app.services.ocr import extract_text_from_image
from app.config import UPLOAD_DIR

import uuid
from pathlib import Path

router = APIRouter(prefix="/api/highlights", tags=["highlights"])


@router.get("", response_model=list[HighlightOut])
async def list_highlights(
    book_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Highlight).order_by(Highlight.created_at.desc())
    if book_id:
        stmt = stmt.where(Highlight.book_id == book_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=HighlightOut, status_code=201)
async def create_highlight(data: HighlightCreate, db: AsyncSession = Depends(get_db)):
    # Verify book exists
    book = await db.get(Book, data.book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    highlight = Highlight(**data.model_dump())
    db.add(highlight)
    await db.commit()
    await db.refresh(highlight)
    return highlight


@router.post("/from-photo", response_model=HighlightOut, status_code=201)
async def create_highlight_from_photo(
    book_id: str = Form(...),
    page_number: int | None = Form(None),
    note: str = Form(""),
    photo: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a photo of a book page and extract highlights via OCR."""
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # Save uploaded image
    ext = Path(photo.filename).suffix if photo.filename else ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = UPLOAD_DIR / filename
    contents = await photo.read()
    filepath.write_bytes(contents)

    # Run OCR
    try:
        extracted_text = extract_text_from_image(str(filepath))
    except anthropic.BadRequestError:
        raise HTTPException(
            status_code=422,
            detail="The page content was blocked by the API content filter. "
            "Try photographing a smaller section of the page.",
        )
    if not extracted_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from image")

    highlight = Highlight(
        book_id=book_id,
        text=extracted_text,
        note=note,
        page_number=page_number,
        source="ocr",
        source_image=filename,
    )
    db.add(highlight)
    await db.commit()
    await db.refresh(highlight)
    return highlight


@router.patch("/{highlight_id}", response_model=HighlightOut)
async def update_highlight(
    highlight_id: str, data: HighlightUpdate, db: AsyncSession = Depends(get_db)
):
    highlight = await db.get(Highlight, highlight_id)
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(highlight, field, value)
    await db.commit()
    await db.refresh(highlight)
    return highlight


@router.delete("/{highlight_id}", status_code=204)
async def delete_highlight(highlight_id: str, db: AsyncSession = Depends(get_db)):
    highlight = await db.get(Highlight, highlight_id)
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")
    await db.delete(highlight)
    await db.commit()


@router.get("/search", response_model=list[SearchResult])
async def search_highlights(q: str, db: AsyncSession = Depends(get_db)):
    """Full-text search across highlights and notes."""
    pattern = f"%{q}%"
    stmt = (
        select(Highlight, Book)
        .join(Book)
        .where(
            or_(
                Highlight.text.ilike(pattern),
                Highlight.note.ilike(pattern),
            )
        )
        .order_by(Highlight.created_at.desc())
        .limit(50)
    )
    result = await db.execute(stmt)
    return [
        SearchResult(
            highlight=HighlightOut.model_validate(h),
            book_title=b.title,
            book_author=b.author,
        )
        for h, b in result.all()
    ]
