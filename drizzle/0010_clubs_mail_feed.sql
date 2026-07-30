CREATE TABLE `clubs` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`owner_user_id` text DEFAULT '' NOT NULL,
	`owner_name` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'application' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_memo` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`approved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "clubs_source_check" CHECK("clubs"."source" IN ('application', 'admin')),
	CONSTRAINT "clubs_status_check" CHECK("clubs"."status" IN ('pending', 'approved', 'rejected')),
	CONSTRAINT "clubs_revision_check" CHECK("clubs"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clubs_slug_uq` ON `clubs` (`slug`);
--> statement-breakpoint
CREATE INDEX `clubs_status_created_idx` ON `clubs` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `clubs_owner_idx` ON `clubs` (`owner_user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `admin_mail_test_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`provider_message_id` text DEFAULT '' NOT NULL,
	`error_message` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "admin_mail_test_runs_status_check" CHECK("admin_mail_test_runs"."status" IN ('sent', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `admin_mail_test_runs_created_idx` ON `admin_mail_test_runs` (`created_at`);
