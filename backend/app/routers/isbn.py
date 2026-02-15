from fastapi import APIRouter, HTTPException

from app.services.isbn_lookup import lookup_isbn

router = APIRouter(prefix="/api/isbn", tags=["isbn"])


@router.get("/{isbn}")
async def get_isbn_metadata(isbn: str):
    """Look up book metadata by ISBN."""
    result = lookup_isbn(isbn)
    if not result:
        raise HTTPException(status_code=404, detail="ISBN not found")
    return result
