ALTER TABLE `coupons` ADD `zone_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE `coupon_claims` (
	`coupon_id` text NOT NULL,
	`user_id` text NOT NULL,
	`claimed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`coupon_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `coupon_claims_user_idx` ON `coupon_claims` (`user_id`,`claimed_at`);--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
	`order_id` text PRIMARY KEY NOT NULL,
	`coupon_id` text NOT NULL,
	`coupon_code` text NOT NULL,
	`claimant_key` text NOT NULL,
	`discount_amount` integer NOT NULL,
	`guard_value` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "coupon_redemptions_discount_check" CHECK("coupon_redemptions"."discount_amount" >= 0),
	CONSTRAINT "coupon_redemptions_guard_check" CHECK("coupon_redemptions"."guard_value" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupon_redemptions_customer_uq` ON `coupon_redemptions` (`coupon_id`,`claimant_key`);--> statement-breakpoint
CREATE INDEX `coupon_redemptions_coupon_idx` ON `coupon_redemptions` (`coupon_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `additional_shipping_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`region_name` text NOT NULL,
	`postcode_start` text NOT NULL,
	`postcode_end` text NOT NULL,
	`extra_fee` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "additional_shipping_rules_fee_check" CHECK("additional_shipping_rules"."extra_fee" >= 0)
);
--> statement-breakpoint
CREATE INDEX `additional_shipping_rules_range_idx` ON `additional_shipping_rules` (`active`,`postcode_start`,`postcode_end`);
