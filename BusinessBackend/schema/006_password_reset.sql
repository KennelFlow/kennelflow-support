-- One-time password reset tokens: store only SHA-256 digests.
CREATE TABLE IF NOT EXISTS app_password_resets (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_password_resets_user_idx ON app_password_resets(user_id);
REVOKE ALL ON app_password_resets FROM PUBLIC;

