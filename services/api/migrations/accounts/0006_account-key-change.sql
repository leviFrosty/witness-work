CREATE TABLE `account_key_history` (
	`account_id` text PRIMARY KEY NOT NULL,
	`key_epoch` integer NOT NULL,
	`blob` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `retired_account_keys` (
	`account_pub` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`key_epoch` integer NOT NULL,
	`retired_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `retired_account_keys_account_idx` ON `retired_account_keys` (`account_id`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `key_changed_at` integer;