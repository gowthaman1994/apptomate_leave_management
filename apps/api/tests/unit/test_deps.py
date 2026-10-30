import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.deps import get_current_user
from app.core.security import create_token


def _request_with_auth_header(value: str | None) -> Request:
    headers = [(b"authorization", value.encode("utf-8"))] if value else []
    scope = {"type": "http", "headers": headers}
    return Request(scope)


def test_get_current_user_accepts_valid_access_token(db, seed_user):
    user_id = seed_user("deps-valid@example.com", "correct-password")
    token = create_token(user_id, "access")
    request = _request_with_auth_header(f"Bearer {token}")

    result = get_current_user(request, db)

    assert result["id"] == user_id
    assert result["email"] == "deps-valid@example.com"


def test_get_current_user_rejects_missing_header(db):
    request = _request_with_auth_header(None)

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request, db)

    assert exc_info.value.status_code == 401


def test_get_current_user_rejects_invalid_token(db):
    request = _request_with_auth_header("Bearer not-a-real-token")

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request, db)

    assert exc_info.value.status_code == 401


def test_get_current_user_rejects_expired_token(db, seed_user, monkeypatch):
    user_id = seed_user("deps-expired@example.com", "correct-password")
    monkeypatch.setattr("app.core.security.settings.jwt_token_minutes", 0)
    token = create_token(user_id, "access")
    import time

    time.sleep(1.1)
    request = _request_with_auth_header(f"Bearer {token}")

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request, db)

    assert exc_info.value.status_code == 401


def test_get_current_user_scopes_rls_to_the_authenticated_user_only(db, seed_user):
    from sqlalchemy import text

    user_a = seed_user("rls-user-a@example.com", "pw-a")
    user_b = seed_user("rls-user-b@example.com", "pw-b")

    token_a = create_token(user_a, "access")
    request_a = _request_with_auth_header(f"Bearer {token_a}")
    get_current_user(request_a, db)

    # Both rows exist (each user got one via the handle_new_user trigger); RLS's
    # "Users can view their own roles" policy (USING user_id = current_user_id())
    # must hide user_b's row now that app.user_id is set to user_a, proving
    # get_current_user() actually scopes RLS to the authenticated user (FR-012) —
    # not just that a query happens to return only one row by coincidence.
    rows = (
        db.execute(
            text("SELECT user_id FROM public.user_roles WHERE user_id IN (:a, :b)"),
            {"a": user_a, "b": user_b},
        )
        .mappings()
        .all()
    )
    visible_user_ids = {str(row["user_id"]) for row in rows}

    assert visible_user_ids == {user_a}


def test_get_current_user_rejects_inactive_account(db, seed_user):
    from sqlalchemy import text

    from app.core.db import set_current_user

    user_id = seed_user("deps-inactive@example.com", "correct-password")
    # RLS only allows a profile update where app.user_id matches the target row's
    # own user_id (or an admin) — set it so this setup step goes through app_user
    # like any real request would, rather than bypassing RLS as the superuser.
    set_current_user(db, user_id)
    db.execute(
        text("UPDATE public.profiles SET status = 'INACTIVE' WHERE user_id = :id"),
        {"id": user_id},
    )
    db.commit()
    token = create_token(user_id, "access")
    request = _request_with_auth_header(f"Bearer {token}")

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request, db)

    assert exc_info.value.status_code == 401
