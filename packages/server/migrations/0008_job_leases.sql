ALTER TABLE analysis_job ADD COLUMN available_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE analysis_job ADD COLUMN lease_token TEXT;
--> statement-breakpoint
ALTER TABLE analysis_job ADD COLUMN lease_expires_at INTEGER;
--> statement-breakpoint
CREATE INDEX analysis_job_ready ON analysis_job(status, available_at, created_at);
--> statement-breakpoint
CREATE INDEX analysis_job_lease ON analysis_job(status, lease_expires_at);
