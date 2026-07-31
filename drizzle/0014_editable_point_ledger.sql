ALTER TABLE `admin_point_ledger` RENAME TO `admin_point_ledger_unsigned`;
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
	CONSTRAINT "admin_point_ledger_before_check" CHECK("admin_point_ledger"."balance_before" >= -9007199254740991 AND "admin_point_ledger"."balance_before" <= 9007199254740991),
	CONSTRAINT "admin_point_ledger_after_check" CHECK("admin_point_ledger"."balance_after" >= -9007199254740991 AND "admin_point_ledger"."balance_after" <= 9007199254740991),
	CONSTRAINT "admin_point_ledger_balance_check" CHECK("admin_point_ledger"."balance_after" = "admin_point_ledger"."balance_before" + "admin_point_ledger"."delta"),
	CONSTRAINT "admin_point_ledger_revision_check" CHECK("admin_point_ledger"."revision" >= 1)
);
--> statement-breakpoint
INSERT INTO `admin_point_ledger` (
	`id`, `user_id`, `delta`, `balance_before`, `balance_after`, `reason`,
	`expires_at`, `revision`, `admin_username`, `deleted_at`, `deleted_by`,
	`delete_reason`, `created_at`
)
SELECT
	`id`, `user_id`, `delta`, `balance_before`, `balance_after`, `reason`,
	NULL, `revision`, `admin_username`, `deleted_at`, `deleted_by`,
	`delete_reason`, `created_at`
FROM `admin_point_ledger_unsigned`;
--> statement-breakpoint
DROP TABLE `admin_point_ledger_unsigned`;
--> statement-breakpoint
CREATE INDEX `admin_point_ledger_user_idx` ON `admin_point_ledger` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `admin_point_ledger_active_idx` ON `admin_point_ledger` (`deleted_at`,`created_at`);
