CREATE TABLE `banner_changes` (
	`banner_id` text PRIMARY KEY NOT NULL,
	`change_type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `banner_changes_type_idx` ON `banner_changes` (`change_type`);--> statement-breakpoint
CREATE INDEX `banner_changes_updated_idx` ON `banner_changes` (`updated_at`);--> statement-breakpoint
CREATE TABLE `category_changes` (
	`category_id` text PRIMARY KEY NOT NULL,
	`change_type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `category_changes_type_idx` ON `category_changes` (`change_type`);--> statement-breakpoint
CREATE INDEX `category_changes_updated_idx` ON `category_changes` (`updated_at`);