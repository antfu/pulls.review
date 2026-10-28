CREATE TABLE automation_config (
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL COLLATE NOCASE,
  enabled INTEGER NOT NULL DEFAULT 0,
  include_drafts INTEGER NOT NULL DEFAULT 0,
  monthly_budget_runs INTEGER,
  locale TEXT NOT NULL DEFAULT 'en',
  llm_ciphertext TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(scope_type, scope_key)
);
--> statement-breakpoint

CREATE TABLE automation_usage (
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL COLLATE NOCASE,
  month TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(scope_type, scope_key, month)
);
