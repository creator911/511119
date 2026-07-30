CREATE TABLE `product_stock` (
	`product_id` text PRIMARY KEY NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "product_stock_nonnegative_check" CHECK("product_stock"."stock" >= 0)
);
