ALTER TABLE `admins` ADD `permissions_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `admins` ADD `session_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `admins_active_idx` ON `admins` (`active`,`username`);--> statement-breakpoint
CREATE TRIGGER `admins_password_session_invalidate`
AFTER UPDATE OF `password_hash` ON `admins`
WHEN OLD.`password_hash` <> NEW.`password_hash`
BEGIN
  UPDATE `admins`
  SET `session_version` = `session_version` + 1
  WHERE `id` = NEW.`id`;
END;--> statement-breakpoint
CREATE TRIGGER `admins_deactivate_session_invalidate`
AFTER UPDATE OF `active` ON `admins`
WHEN OLD.`active` <> NEW.`active` AND NEW.`active` = 0
BEGIN
  UPDATE `admins`
  SET `session_version` = `session_version` + 1
  WHERE `id` = NEW.`id`;
END;
