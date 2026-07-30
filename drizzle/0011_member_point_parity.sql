ALTER TABLE `users` ADD COLUMN `telephone` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `homepage` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `address3` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `admin_memo` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `identity_method` text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `identity_verified` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `email_verified` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `adult_verified` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `public_profile` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `member_signature` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `member_profile` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `verification_history` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `withdrawn_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `blocked_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `member_icon` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `member_image` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `extra1` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `extra2` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `extra3` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `extra4` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `extra5` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `extra6` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `extra7` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `extra8` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `extra9` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `extra10` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `admin_point_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`balance_before` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text NOT NULL,
	`expires_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`admin_username` text DEFAULT '' NOT NULL,
	`deleted_at` text,
	`deleted_by` text DEFAULT '' NOT NULL,
	`delete_reason` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "admin_point_ledger_delta_check" CHECK("admin_point_ledger"."delta" <> 0),
	CONSTRAINT "admin_point_ledger_before_check" CHECK("admin_point_ledger"."balance_before" >= 0 AND "admin_point_ledger"."balance_before" <= 9007199254740991),
	CONSTRAINT "admin_point_ledger_after_check" CHECK("admin_point_ledger"."balance_after" >= 0 AND "admin_point_ledger"."balance_after" <= 9007199254740991),
	CONSTRAINT "admin_point_ledger_balance_check" CHECK("admin_point_ledger"."balance_after" = "admin_point_ledger"."balance_before" + "admin_point_ledger"."delta"),
	CONSTRAINT "admin_point_ledger_revision_check" CHECK("admin_point_ledger"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `admin_point_ledger_user_idx` ON `admin_point_ledger` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `admin_point_ledger_active_idx` ON `admin_point_ledger` (`deleted_at`,`created_at`);
--> statement-breakpoint
CREATE TABLE `admin_point_write_guards` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`guard_value` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "admin_point_write_guards_value_check" CHECK("admin_point_write_guards"."guard_value" = 1)
);
--> statement-breakpoint
CREATE TABLE `member_access_groups` (
	`user_id` text NOT NULL,
	`group_id` text NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `group_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `community_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_access_groups_group_idx` ON `member_access_groups` (`group_id`,`user_id`);
--> statement-breakpoint
CREATE TABLE `member_access_group_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "member_access_group_state_revision_check" CHECK("member_access_group_state"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE `member_access_group_write_guards` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`guard_value` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "member_access_group_write_guards_value_check" CHECK("member_access_group_write_guards"."guard_value" = 1)
);
