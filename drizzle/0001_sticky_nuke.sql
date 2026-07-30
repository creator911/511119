CREATE TABLE `product_changes` (
	`product_id` text PRIMARY KEY NOT NULL,
	`change_type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_changes_type_idx` ON `product_changes` (`change_type`);--> statement-breakpoint
CREATE INDEX `product_changes_updated_idx` ON `product_changes` (`updated_at`);