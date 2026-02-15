from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import init_db
from app.config import UPLOAD_DIR
from app.routers import books, highlights, kindle, isbn, publish


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Book Highlights Tracker",
    description="Track, search, and publish book highlights from physical books and Kindle.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Register routers
app.include_router(books.router)
app.include_router(highlights.router)
app.include_router(kindle.router)
app.include_router(isbn.router)
app.include_router(publish.router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
