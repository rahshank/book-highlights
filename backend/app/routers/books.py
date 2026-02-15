from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Book, Highlight
from app.schemas import BookCreate, BookUpdate, BookOut, BookSummary

router = APIRouter(prefix="/api/books", tags=["books"])


@router.get("", response_model=list[BookSummary])
async def list_books(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(
            Book,
            func.count(Highlight.id).label("highlight_count"),
        )
        .outerjoin(Highlight)
        .group_by(Book.id)
        .order_by(Book.created_at.desc())
    )
    results = await db.execute(stmt)
    books = []
    for book, count in results.all():
        books.append(
            BookSummary(
                id=book.id,
                title=book.title,
                author=book.author,
                isbn=book.isbn,
                cover_url=book.cover_url,
                source=book.source,
                created_at=book.created_at,
                highlight_count=count,
            )
        )
    return books


@router.get("/{book_id}", response_model=BookOut)
async def get_book(book_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Book).where(Book.id == book_id).options(selectinload(Book.highlights))
    result = await db.execute(stmt)
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.post("", response_model=BookOut, status_code=201)
async def create_book(data: BookCreate, db: AsyncSession = Depends(get_db)):
    book = Book(**data.model_dump())
    db.add(book)
    await db.commit()
    await db.refresh(book, attribute_names=["highlights"])
    return book


@router.patch("/{book_id}", response_model=BookOut)
async def update_book(book_id: str, data: BookUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(Book).where(Book.id == book_id).options(selectinload(Book.highlights))
    result = await db.execute(stmt)
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(book, field, value)
    await db.commit()
    await db.refresh(book, attribute_names=["highlights"])
    return book


@router.delete("/{book_id}", status_code=204)
async def delete_book(book_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Book).where(Book.id == book_id)
    result = await db.execute(stmt)
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    await db.delete(book)
    await db.commit()
