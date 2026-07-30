CREATE TABLE IF NOT EXISTS `legacy_shop_settings` (
  `id` integer PRIMARY KEY NOT NULL,
  `values_json` text DEFAULT '{}' NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `updated_by` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT `legacy_shop_settings_id_check` CHECK(`legacy_shop_settings`.`id` = 1),
  CONSTRAINT `legacy_shop_settings_revision_check` CHECK(`legacy_shop_settings`.`revision` >= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `legacy_shop_write_guards` (
  `operation_id` text PRIMARY KEY NOT NULL,
  `guard_value` integer NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT `legacy_shop_write_guards_value_check` CHECK(`legacy_shop_write_guards`.`guard_value` = 1)
);
