ALTER TABLE analysis_job ADD COLUMN model TEXT;
--> statement-breakpoint
ALTER TABLE analysis_job ADD COLUMN prompt_version INTEGER;
--> statement-breakpoint

CREATE TABLE analysis_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL,
  owner TEXT NOT NULL COLLATE NOCASE,
  repo TEXT NOT NULL COLLATE NOCASE,
  pr_number INTEGER NOT NULL,
  github_user_id INTEGER NOT NULL,
  rating TEXT NOT NULL,
  group_key TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(result_id, github_user_id, group_key)
);
--> statement-breakpoint

CREATE INDEX analysis_feedback_result
  ON analysis_feedback(result_id, rating);
