CREATE TABLE `product_type_write_guards` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`guard_value` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "product_type_write_guards_value_check" CHECK("product_type_write_guards"."guard_value" = 1)
);
--> statement-breakpoint
CREATE INDEX `product_type_write_guards_product_idx` ON `product_type_write_guards` (`product_id`);
--> statement-breakpoint
CREATE TABLE `product_options` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`option_name` text NOT NULL,
	`option_value` text NOT NULL,
	`price_delta` integer DEFAULT 0 NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`sale_enabled` integer DEFAULT 1 NOT NULL,
	`sold_out` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "product_options_stock_check" CHECK("product_options"."stock" >= 0),
	CONSTRAINT "product_options_sale_check" CHECK("product_options"."sale_enabled" IN (0, 1)),
	CONSTRAINT "product_options_soldout_check" CHECK("product_options"."sold_out" IN (0, 1)),
	CONSTRAINT "product_options_deleted_check" CHECK("product_options"."deleted" IN (0, 1)),
	CONSTRAINT "product_options_revision_check" CHECK("product_options"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `product_options_product_idx` ON `product_options` (`product_id`,`deleted`,`sort_order`);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_options_active_value_uq` ON `product_options` (`product_id`,`option_name`,`option_value`) WHERE `deleted` = 0;
--> statement-breakpoint
CREATE TABLE `product_option_sets` (
	`product_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_option_write_guards` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`option_id` text NOT NULL,
	`guard_value` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "product_option_write_guards_value_check" CHECK("product_option_write_guards"."guard_value" = 1)
);
--> statement-breakpoint
CREATE INDEX `product_option_write_guards_option_idx` ON `product_option_write_guards` (`option_id`);
--> statement-breakpoint
CREATE TABLE `order_option_items` (
	`order_id` text NOT NULL,
	`option_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`option_name` text NOT NULL,
	`option_value` text NOT NULL,
	`price_delta` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`order_id`, `option_id`),
	CONSTRAINT "order_option_items_quantity_check" CHECK("order_option_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `order_option_items_product_idx` ON `order_option_items` (`product_id`);
--> statement-breakpoint
CREATE TABLE `order_option_guards` (
	`order_id` text NOT NULL,
	`option_id` text NOT NULL,
	`guard_value` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`order_id`, `option_id`),
	CONSTRAINT "order_option_guards_value_check" CHECK("order_option_guards"."guard_value" = 1)
);
--> statement-breakpoint
CREATE TABLE `restock_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`phone` text NOT NULL,
	`phone_hash` text NOT NULL,
	`status` text DEFAULT 'waiting_provider' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`admin_memo` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "restock_requests_status_check" CHECK("restock_requests"."status" IN ('waiting_provider', 'queued', 'sent', 'failed', 'cancelled')),
	CONSTRAINT "restock_requests_revision_check" CHECK("restock_requests"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `restock_requests_product_idx` ON `restock_requests` (`product_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `restock_requests_status_idx` ON `restock_requests` (`status`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `restock_requests_active_uq` ON `restock_requests` (`product_id`,`phone_hash`) WHERE `status` IN ('waiting_provider', 'queued');
--> statement-breakpoint
CREATE TABLE `restock_sms_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`status` text DEFAULT 'waiting_provider' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`queued_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "restock_sms_queue_status_check" CHECK("restock_sms_queue"."status" IN ('waiting_provider', 'queued', 'sent', 'failed', 'cancelled')),
	CONSTRAINT "restock_sms_queue_attempts_check" CHECK("restock_sms_queue"."attempts" >= 0),
	CONSTRAINT "restock_sms_queue_revision_check" CHECK("restock_sms_queue"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `restock_sms_queue_request_uq` ON `restock_sms_queue` (`request_id`);
--> statement-breakpoint
CREATE INDEX `restock_sms_queue_status_idx` ON `restock_sms_queue` (`status`,`queued_at`);
--> statement-breakpoint
CREATE TABLE `restock_request_rate_limits` (
	`client_key` text NOT NULL,
	`window_start` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`client_key`, `window_start`),
	CONSTRAINT "restock_request_rate_limits_attempts_check" CHECK("restock_request_rate_limits"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE `restock_write_guards` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`guard_value` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "restock_write_guards_value_check" CHECK("restock_write_guards"."guard_value" = 1)
);
--> statement-breakpoint
CREATE INDEX `restock_write_guards_request_idx` ON `restock_write_guards` (`request_id`);
