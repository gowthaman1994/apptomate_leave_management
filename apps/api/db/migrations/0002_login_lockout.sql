-- Adds brute-force lockout tracking to public.users (feature: user-login-auth, FR-013)
ALTER TABLE public.users
  ADD COLUMN failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz;
