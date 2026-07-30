CREATE TABLE `product_stock_controls` (
	`product_id` text PRIMARY KEY NOT NULL,
	`notification_qty` integer DEFAULT 0 NOT NULL,
	`sale_enabled` integer DEFAULT 1 NOT NULL,
	`sold_out` integer DEFAULT 0 NOT NULL,
	`restock_notification` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "product_stock_controls_notification_check" CHECK("product_stock_controls"."notification_qty" >= 0),
	CONSTRAINT "product_stock_controls_sale_check" CHECK("product_stock_controls"."sale_enabled" IN (0, 1)),
	CONSTRAINT "product_stock_controls_soldout_check" CHECK("product_stock_controls"."sold_out" IN (0, 1)),
	CONSTRAINT "product_stock_controls_restock_check" CHECK("product_stock_controls"."restock_notification" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `product_stock_write_guards` (
	`product_id` text PRIMARY KEY NOT NULL,
	`guard_value` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "product_stock_write_guards_value_check" CHECK("product_stock_write_guards"."guard_value" = 1)
);
