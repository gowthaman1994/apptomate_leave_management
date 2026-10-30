import time

from app.core.security import create_token, encrypt_payload


def _login(client, email, password):
    body = encrypt_payload({"email": email, "password": password})
    return client.post("/api/auth/login", content=body)


def _refresh(client, refresh_token):
    body = encrypt_payload({"refresh_token": refresh_token})
    return client.post("/api/auth/refresh", content=body)


def test_login_success_returns_token_pair(client, seed_user):
    seed_user("success@example.com", "correct-password")

    response = _login(client, "success@example.com", "correct-password")

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password_and_unknown_email_are_identical(client, seed_user):
    seed_user("wrongpw@example.com", "correct-password")

    wrong_password = _login(client, "wrongpw@example.com", "incorrect-password")
    unknown_email = _login(client, "does-not-exist@example.com", "whatever")

    assert wrong_password.status_code == 401
    assert unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_login_rejects_malformed_encrypted_body(client):
    response = client.post("/api/auth/login", content=b"not-a-valid-fernet-token")

    assert response.status_code == 400


def test_refresh_rejects_malformed_encrypted_body(client):
    response = client.post("/api/auth/refresh", content=b"not-a-valid-fernet-token")

    assert response.status_code == 400


def test_refresh_with_valid_token_returns_new_token_pair(client, seed_user):
    user_id = seed_user("refresh-ok@example.com", "correct-password")
    refresh_token = create_token(user_id, "refresh")

    response = _refresh(client, refresh_token)

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_refresh_with_expired_token_is_rejected(client, seed_user, monkeypatch):
    user_id = seed_user("refresh-expired@example.com", "correct-password")
    monkeypatch.setattr("app.core.security.settings.jwt_token_minutes", 0)
    refresh_token = create_token(user_id, "refresh")
    time.sleep(1.1)

    response = _refresh(client, refresh_token)

    assert response.status_code == 401


def test_refresh_rejects_access_token(client, seed_user):
    user_id = seed_user("refresh-wrong-type@example.com", "correct-password")
    access_token = create_token(user_id, "access")

    response = _refresh(client, access_token)

    assert response.status_code == 401


def test_me_with_valid_token_returns_current_user(client, seed_user):
    user_id = seed_user("me-valid@example.com", "correct-password")
    access_token = create_token(user_id, "access")

    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {access_token}"})

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == user_id
    assert data["email"] == "me-valid@example.com"


def test_me_without_token_is_rejected(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401


def test_me_with_expired_token_is_rejected(client, seed_user, monkeypatch):
    user_id = seed_user("me-expired@example.com", "correct-password")
    monkeypatch.setattr("app.core.security.settings.jwt_token_minutes", 0)
    access_token = create_token(user_id, "access")
    time.sleep(1.1)

    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {access_token}"})

    assert response.status_code == 401


def test_me_with_deactivated_account_is_rejected(client, seed_user, db):
    from sqlalchemy import text

    from app.core.db import set_current_user

    user_id = seed_user("me-deactivated@example.com", "correct-password")
    set_current_user(db, user_id)
    db.execute(
        text("UPDATE public.profiles SET status = 'INACTIVE' WHERE user_id = :id"),
        {"id": user_id},
    )
    db.commit()
    access_token = create_token(user_id, "access")

    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {access_token}"})

    assert response.status_code == 401
