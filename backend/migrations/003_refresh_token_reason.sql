-- Distinguish why a refresh token was revoked. Only reuse of a ROTATED token indicates theft;
-- presenting a token revoked by logout or an admin block must not sign the user out everywhere.
ALTER TABLE refresh_tokens ADD COLUMN revoked_reason varchar(16)
  CHECK (revoked_reason IN ('ROTATED', 'LOGOUT', 'BLOCKED', 'REUSE'));
