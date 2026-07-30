CREATE TABLE `wallet_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`request_type` text NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`admin_username` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "wallet_ledger_type_check" CHECK("wallet_ledger"."request_type" IN ('charge', 'withdrawal')),
	CONSTRAINT "wallet_ledger_delta_check" CHECK("wallet_ledger"."delta" <> 0),
	CONSTRAINT "wallet_ledger_balance_check" CHECK("wallet_ledger"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_ledger_request_uq` ON `wallet_ledger` (`request_type`,`request_id`);--> statement-breakpoint
CREATE INDEX `wallet_ledger_user_idx` ON `wallet_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `wallet_processing_guards` (
	`request_type` text NOT NULL,
	`request_id` text NOT NULL,
	`transition_guard` integer NOT NULL,
	`balance_guard` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`request_type`, `request_id`),
	CONSTRAINT "wallet_processing_guards_type_check" CHECK("wallet_processing_guards"."request_type" IN ('charge', 'withdrawal')),
	CONSTRAINT "wallet_processing_guards_transition_check" CHECK("wallet_processing_guards"."transition_guard" = 1),
	CONSTRAINT "wallet_processing_guards_balance_check" CHECK("wallet_processing_guards"."balance_guard" = 1)
);
--> statement-breakpoint
CREATE TABLE `wallet_request_rate_limits` (
	`user_id` text NOT NULL,
	`request_type` text NOT NULL,
	`window_start` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `request_type`, `window_start`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `orderer_postcode` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `orderer_address1` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `orderer_address2` text DEFAULT '' NOT NULL;