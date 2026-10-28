CREATE TABLE github_installation (
  id INTEGER PRIMARY KEY,
  account_login TEXT,
  account_type TEXT,
  repository_selection TEXT,
  suspended INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
--> statement-breakpoint

CREATE TABLE github_repository (
  id INTEGER PRIMARY KEY,
  installation_id INTEGER,
  owner TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL COLLATE NOCASE,
  private INTEGER,
  archived INTEGER,
  default_branch TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  removed_at INTEGER,
  UNIQUE(owner, name)
);
--> statement-breakpoint

CREATE INDEX github_repository_installation
  ON github_repository(installation_id, updated_at DESC);
--> statement-breakpoint

CREATE TABLE analysis_job (
  id TEXT PRIMARY KEY,
  delivery_id TEXT UNIQUE,
  owner TEXT NOT NULL COLLATE NOCASE,
  repo TEXT NOT NULL COLLATE NOCASE,
  pr_number INTEGER NOT NULL,
  installation_id INTEGER,
  head_sha TEXT,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL,
  config_source_type TEXT NOT NULL,
  config_source_github_user_id INTEGER,
  result_id INTEGER,
  error_code TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
--> statement-breakpoint

CREATE INDEX analysis_job_pr_status_created
  ON analysis_job(owner, repo, pr_number, status, created_at DESC);
--> statement-breakpoint

CREATE UNIQUE INDEX analysis_job_active_head
  ON analysis_job(owner, repo, pr_number, head_sha)
  WHERE status IN ('queued', 'running') AND head_sha IS NOT NULL;
--> statement-breakpoint

CREATE TABLE analysis_attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  UNIQUE(job_id, attempt_number)
);
--> statement-breakpoint

CREATE INDEX analysis_attempt_job_started
  ON analysis_attempt(job_id, started_at DESC);
