from fastapi import Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.db import get_db, set_current_user
from app.core.security import InvalidTokenError, decode_token, decrypt_payload

NOT_AUTHENTICATED_DETAIL = "Not authenticated."


async def decrypt_body(request: Request) -> dict:
    raw = await request.body()
    try:
        return decrypt_payload(raw)
    except InvalidTokenError:
        raise HTTPException(status_code=400, detail="Invalid request.") from None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> dict:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED_DETAIL)
    token = auth_header[len("Bearer ") :]

    try:
        claims = decode_token(token, expected_type="access")
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED_DETAIL) from None

    user_id = claims["sub"]

    profile = db.execute(
        text("SELECT status FROM public.profiles WHERE user_id = :user_id"),
        {"user_id": user_id},
    ).mappings().first()

    # A soft-deleted profile is invisible to this SELECT under RLS ("Users can view
    # all active profiles" requires deleted_at IS NULL), so `profile is None` covers
    # both "no such profile" and "soft-deleted" — both must be rejected the same way.
    if profile is None or profile["status"] == "INACTIVE":
        raise HTTPException(status_code=401, detail=NOT_AUTHENTICATED_DETAIL)

    set_current_user(db, user_id)

    user_row = db.execute(
        text("SELECT email FROM public.users WHERE id = :id"), {"id": user_id}
    ).first()

    return {"id": user_id, "email": user_row[0]}
