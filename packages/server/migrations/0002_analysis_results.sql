CREATE TABLE analysis_result (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL COLLATE NOCASE,
  repo TEXT NOT NULL COLLATE NOCASE,
  pr_number INTEGER NOT NULL,
  author_login TEXT NOT NULL COLLATE NOCASE,
  result_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner, repo, pr_number, author_login)
);
--> statement-breakpoint

CREATE INDEX analysis_result_pr_updated_at
  ON analysis_result(owner, repo, pr_number, updated_at DESC);
