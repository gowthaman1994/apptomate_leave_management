from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="API_", env_file=".env", extra="ignore")

    app_name: str = "Apptomate Leave Management API"
    cors_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "postgresql+psycopg://app_user:app_user@localhost:5432/leave_management"

    jwt_secret_key: str
    jwt_token_minutes: int = 15
    payload_encryption_key: str

    max_failed_login_attempts: int = 5
    lockout_minutes: int = 15


settings = Settings()
