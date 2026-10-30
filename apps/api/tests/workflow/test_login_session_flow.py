import time

from app.core.security import encrypt_payload


def _login(client, email, password):
    body = encrypt_payload({"email": email, "password": password})
    return client.post("/api/auth/login", content=body)


def _refresh(client, refresh_token):
    body = encrypt_payload({"refresh_token": refresh_token})
    return client.post("/api/auth/refresh", content=body)


def test_repeated_failures_lock_account_even_for_correct_password(client, seed_user):
    seed_user("lockout@example.com", "correct-password")

    for _ in range(5):
        response = _login(client, "lockout@example.com", "wrong-password")
        assert response.status_code == 401

    response = _login(client, "lockout@example.com", "correct-password")

    assert response.status_code == 401


def test_refresh_within_window_succeeds_but_after_window_is_rejected(
    client, seed_user, monkeypatch
):
    seed_user("sliding-window@example.com", "correct-password")

    login_response = _login(client, "sliding-window@example.com", "correct-password")
    refresh_token = login_response.json()["refresh_token"]

    within_window = _refresh(client, refresh_token)
    assert within_window.status_code == 200

    monkeypatch.setattr("app.core.security.settings.jwt_token_minutes", 0)
    login_response_2 = _login(client, "sliding-window@example.com", "correct-password")
    expired_refresh_token = login_response_2.json()["refresh_token"]
    time.sleep(1.1)

    after_window = _refresh(client, expired_refresh_token)
    assert after_window.status_code == 401


def test_deactivating_account_invalidates_still_unexpired_access_token(client, seed_user, db):
    from sqlalchemy import text

    from app.core.db import set_current_user

    seed_user("workflow-deactivate@example.com", "correct-password")

    login_response = _login(client, "workflow-deactivate@example.com", "correct-password")
    access_token = login_response.json()["access_token"]

    first_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert first_me.status_code == 200
    user_id = first_me.json()["id"]

    set_current_user(db, user_id)
    db.execute(
        text("UPDATE public.profiles SET status = 'INACTIVE' WHERE user_id = :id"),
        {"id": user_id},
    )
    db.commit()

    second_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert second_me.status_code == 401
