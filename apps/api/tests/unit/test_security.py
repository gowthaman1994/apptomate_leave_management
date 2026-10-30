import time

import pytest

from app.core.security import (
    InvalidTokenError,
    create_token,
    decode_token,
    decrypt_payload,
    encrypt_payload,
    hash_password,
    verify_password,
)


def test_hash_password_and_verify_round_trip():
    hashed = hash_password("correct-password")
    assert verify_password("correct-password", hashed) is True


def test_verify_password_rejects_wrong_password():
    hashed = hash_password("correct-password")
    assert verify_password("wrong-password", hashed) is False


def test_create_and_decode_token_round_trip():
    token = create_token("user-123", "access")
    payload = decode_token(token, expected_type="access")
    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"


def test_decode_token_rejects_expired_token(monkeypatch):
    monkeypatch.setattr("app.core.security.settings.jwt_token_minutes", 0)
    token = create_token("user-123", "access")
    time.sleep(1.1)
    with pytest.raises(InvalidTokenError):
        decode_token(token, expected_type="access")


def test_decode_token_rejects_type_mismatch():
    token = create_token("user-123", "refresh")
    with pytest.raises(InvalidTokenError):
        decode_token(token, expected_type="access")


def test_decode_token_rejects_type_mismatch_reverse():
    token = create_token("user-123", "access")
    with pytest.raises(InvalidTokenError):
        decode_token(token, expected_type="refresh")


def test_encrypt_and_decrypt_payload_round_trip():
    data = {"email": "person@example.com", "password": "secret"}
    ciphertext = encrypt_payload(data)
    assert decrypt_payload(ciphertext) == data


def test_decrypt_payload_rejects_tampered_ciphertext():
    ciphertext = encrypt_payload({"a": 1})
    tampered = ciphertext[:-1] + (b"0" if ciphertext[-1:] != b"0" else b"1")
    with pytest.raises(InvalidTokenError):
        decrypt_payload(tampered)
