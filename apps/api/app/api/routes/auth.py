from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import decrypt_body, get_current_user
from app.core.config import settings
from app.core.db import get_db
from app.core.security import InvalidTokenError, create_token, decode_token, verify_password
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse

router = APIRouter()

INVALID_CREDENTIALS_DETAIL = "Invalid email or password."
SESSION_EXPIRED_DETAIL = "Session expired. Please sign in again."


def _issue_tokens(user_id: str) -> TokenResponse:
    return TokenResponse(
        access_token=create_token(user_id, "access"),
        refresh_token=create_token(user_id, "refresh"),
        expires_in=settings.jwt_token_minutes * 60,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: dict = Depends(decrypt_body), db: Session = Depends(get_db)) -> TokenResponse:
    try:
        request = LoginRequest(**payload)
    except ValidationError:
        raise HTTPException(status_code=422, detail="Invalid request body.") from None

    row = db.execute(
        text(
            "SELECT id, hashed_password, failed_login_attempts, locked_until "
            "FROM public.users WHERE email = :email"
        ),
        {"email": request.email},
    ).mappings().first()

    if row is None:
        raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS_DETAIL)

    now = datetime.now(timezone.utc)
    if row["locked_until"] is not None and row["locked_until"] > now:
        raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS_DETAIL)

    if not verify_password(request.password, row["hashed_password"]):
        attempts = row["failed_login_attempts"] + 1
        if attempts >= settings.max_failed_login_attempts:
            db.execute(
                text(
                    "UPDATE public.users SET failed_login_attempts = 0, "
                    "locked_until = :locked_until WHERE id = :id"
                ),
                {
                    "locked_until": now + timedelta(minutes=settings.lockout_minutes),
                    "id": row["id"],
                },
            )
        else:
            db.execute(
                text("UPDATE public.users SET failed_login_attempts = :attempts WHERE id = :id"),
                {"attempts": attempts, "id": row["id"]},
            )
        db.commit()
        raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS_DETAIL)

    db.execute(
        text(
            "UPDATE public.users SET failed_login_attempts = 0, locked_until = NULL "
            "WHERE id = :id"
        ),
        {"id": row["id"]},
    )
    db.commit()

    return _issue_tokens(str(row["id"]))


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: dict = Depends(decrypt_body)) -> TokenResponse:
    try:
        request = RefreshRequest(**payload)
    except ValidationError:
        raise HTTPException(status_code=422, detail="Invalid request body.") from None

    try:
        claims = decode_token(request.refresh_token, expected_type="refresh")
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail=SESSION_EXPIRED_DETAIL) from None

    return _issue_tokens(claims["sub"])


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)) -> dict:
    return current_user
