CREATE TABLE user_config (
  github_user_id INTEGER PRIMARY KEY,
  github_login TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
