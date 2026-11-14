CREATE TABLE `inbox_successors` (
	`inbox_id` text PRIMARY KEY NOT NULL,
	`successor_id` text NOT NULL,
	`account_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inbox_successors_account_idx` ON `inbox_successors` (`account_id`);--> statement-breakpoint
CREATE INDEX `inbox_successors_recorded_idx` ON `inbox_successors` (`recorded_at`);--> statement-breakpoint
ALTER TABLE `account_inboxes` ADD `key_epoch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Links from before this column: the epoch whose key was the account's when
-- the link was made, one past the last key retired before it (0 for every
-- account that never changed its key). Never the current epoch, which would
-- let a link the old key made name itself a successor. A link made within a
-- second after a key change counts as the old key's: its proof may have been
-- checked against the old key just before the change landed. The device that
-- made it can register it again with the new key's proof to move it up.
UPDATE `account_inboxes` SET `key_epoch` = COALESCE((
	SELECT MAX(`r`.`key_epoch`) + 1 FROM `retired_account_keys` AS `r`
	WHERE `r`.`account_id` = `account_inboxes`.`account_id`
		AND `r`.`retired_at` <= `account_inboxes`.`created_at` - 1000
), 0);
