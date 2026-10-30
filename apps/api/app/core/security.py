import json
import time
from typing import Literal

import bcrypt
import jwt
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


class InvalidTokenError(Exception):
    pass


def create_token(user_id: str, token_type: Literal["access", "refresh"]) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "type": token_type,
        "iat": now,
        "exp": now + settings.jwt_token_minutes * 60,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def decode_token(token: str, expected_type: Literal["access", "refresh"]) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise InvalidTokenError("Invalid or expired token.") from exc

    if payload.get("type") != expected_type:
        raise InvalidTokenError("Unexpected token type.")

    return payload


def encrypt_payload(data: dict) -> bytes:
    fernet = Fernet(settings.payload_encryption_key.encode("utf-8"))
    return fernet.encrypt(json.dumps(data).encode("utf-8"))


def decrypt_payload(ciphertext: bytes) -> dict:
    fernet = Fernet(settings.payload_encryption_key.encode("utf-8"))
    try:
        plaintext = fernet.decrypt(ciphertext)
    except InvalidToken as exc:
        raise InvalidTokenError("Invalid encrypted payload.") from exc
    return json.loads(plaintext)
