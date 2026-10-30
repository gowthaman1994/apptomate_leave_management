import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.main import app


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def seed_user(db):
    created_ids = []

    def _create(email: str, password: str) -> str:
        hashed = hash_password(password)
        row = db.execute(
            text(
                "INSERT INTO public.users (email, hashed_password) "
                "VALUES (:email, :hashed) RETURNING id"
            ),
            {"email": email, "hashed": hashed},
        ).first()
        db.commit()
        user_id = str(row[0])
        created_ids.append(user_id)
        return user_id

    yield _create

    for user_id in created_ids:
        db.execute(text("DELETE FROM public.users WHERE id = :id"), {"id": user_id})
    db.commit()
