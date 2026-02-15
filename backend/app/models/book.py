import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Book(Base):
    __tablename__ = "books"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    author: Mapped[str] = mapped_column(String(500), default="")
    isbn: Mapped[str] = mapped_column(String(20), default="", index=True)
    cover_url: Mapped[str] = mapped_column(String(1000), default="")
    publisher: Mapped[str] = mapped_column(String(500), default="")
    year: Mapped[str] = mapped_column(String(10), default="")
    source: Mapped[str] = mapped_column(String(50), default="manual")  # manual, kindle, photo
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    notes: Mapped[str] = mapped_column(Text, default="")

    highlights: Mapped[list["Highlight"]] = relationship(
        "Highlight", back_populates="book", cascade="all, delete-orphan"
    )
