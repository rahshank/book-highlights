from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Book, Highlight
from app.schemas import HighlightCreate, HighlightUpdate, HighlightOut, ScanResult, SearchResult
from app.services.ocr import extract_text_from_image
from app.config import UPLOAD_DIR

import asyncio
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


@router.post("/scan", response_model=ScanResult)
async def scan_page_photo(
    photo: UploadFile = File(...),
):
    """Upload a photo of a book page and extract text via OCR.

    Returns the extracted text for user review — does NOT save anything.
    """
    try:
        ext = Path(photo.filename).suffix if photo.filename else ".jpg"
        filename = f"{uuid.uuid4()}{ext}"
        filepath = UPLOAD_DIR / filename
        contents = await photo.read()
        filepath.write_bytes(contents)
        print(f"[SCAN] Saved upload to {filepath} ({len(contents)} bytes)")

        extracted_text, detected_page = await asyncio.get_event_loop().run_in_executor(
            None, extract_text_from_image, str(filepath)
        )
        if not extracted_text.strip():
            raise HTTPException(status_code=422, detail="Could not extract text from image")

        print(f"[SCAN] Success — {len(extracted_text)} chars extracted, page={detected_page}")
        return ScanResult(text=extracted_text, source_image=filename, detected_page=detected_page)
    except HTTPException:
        raise
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}")


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
