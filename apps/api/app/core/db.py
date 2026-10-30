from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def set_current_user(db: Session, user_id: str) -> None:
    """Scopes RLS policies to this user for the current transaction.

    Must run inside a transaction (SET LOCAL is transaction-scoped) before any
    query that relies on public.current_user_id(), e.g. right after authenticating
    the request and before the first query in that request's db session.
    """
    # `SET LOCAL` itself does not accept a bind parameter in Postgres (it's a
    # syntax-level literal), so this uses the `set_config()` function instead,
    # with `is_local=true` giving the same transaction-scoped behavior.
    db.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_id})
