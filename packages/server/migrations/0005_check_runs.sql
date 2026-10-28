ALTER TABLE automation_config ADD COLUMN publish_check_run INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE analysis_job ADD COLUMN check_run_id INTEGER;
