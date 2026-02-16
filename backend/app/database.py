from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import DATABASE_URL

_engine_kwargs: dict = {"echo": False}
if DATABASE_URL.startswith("postgresql"):
    _engine_kwargs.update(
        # PgBouncer handles pooling — use NullPool on SQLAlchemy side
        poolclass=NullPool,
        # PgBouncer in transaction mode doesn't support prepared statements
        connect_args={"statement_cache_size": 0},
    )
else:
    _engine_kwargs.update(connect_args={"check_same_thread": False})
engine = create_async_engine(DATABASE_URL, **_engine_kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
