-- Application-managed accounts. Passwords are scrypt hashes, never plaintext.
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app_users, app_sessions FROM PUBLIC;
-- Only trusted authentication service role can access app_users/app_sessions.
-- RLS must be enforced on data access through a separate non-owner role.
