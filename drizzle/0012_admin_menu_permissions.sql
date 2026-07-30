ALTER TABLE `admins` ADD `member_user_id` text;--> statement-breakpoint
CREATE INDEX `admins_member_user_idx` ON `admins` (`member_user_id`);--> statement-breakpoint
CREATE TABLE `admin_menu_permissions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `admin_id` integer NOT NULL,
  `menu_code` text NOT NULL,
  `auth_flags` text NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT `admin_menu_permissions_revision_check` CHECK(`admin_menu_permissions`.`revision` >= 1)
);--> statement-breakpoint
CREATE UNIQUE INDEX `admin_menu_permissions_admin_menu_uq` ON `admin_menu_permissions` (`admin_id`,`menu_code`);--> statement-breakpoint
CREATE INDEX `admin_menu_permissions_admin_idx` ON `admin_menu_permissions` (`admin_id`,`menu_code`);--> statement-breakpoint
CREATE TABLE `admin_permission_challenges` (
  `id` text PRIMARY KEY NOT NULL,
  `admin_username` text NOT NULL,
  `answer_hash` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE INDEX `admin_permission_challenges_expiry_idx` ON `admin_permission_challenges` (`expires_at`);--> statement-breakpoint
CREATE TRIGGER `admin_menu_permission_insert_session_invalidate`
AFTER INSERT ON `admin_menu_permissions`
BEGIN
  UPDATE `admins`
  SET `session_version` = `session_version` + 1
  WHERE `id` = NEW.`admin_id`;
END;--> statement-breakpoint
CREATE TRIGGER `admin_menu_permission_update_session_invalidate`
AFTER UPDATE OF `auth_flags` ON `admin_menu_permissions`
WHEN OLD.`auth_flags` <> NEW.`auth_flags`
BEGIN
  UPDATE `admins`
  SET `session_version` = `session_version` + 1
  WHERE `id` = NEW.`admin_id`;
END;--> statement-breakpoint
CREATE TRIGGER `admin_menu_permission_delete_session_invalidate`
AFTER DELETE ON `admin_menu_permissions`
BEGIN
  UPDATE `admins`
  SET `session_version` = `session_version` + 1
  WHERE `id` = OLD.`admin_id`;
END;--> statement-breakpoint
CREATE TRIGGER `users_admin_password_session_invalidate`
AFTER UPDATE OF `password_hash` ON `users`
WHEN OLD.`password_hash` <> NEW.`password_hash`
BEGIN
  UPDATE `admins`
  SET `session_version` = `session_version` + 1
  WHERE `member_user_id` = NEW.`id`;
END;--> statement-breakpoint
CREATE TRIGGER `users_admin_deactivate_session_invalidate`
AFTER UPDATE OF `active` ON `users`
WHEN OLD.`active` <> NEW.`active`
BEGIN
  UPDATE `admins`
  SET `session_version` = `session_version` + 1
  WHERE `member_user_id` = NEW.`id`;
END;
