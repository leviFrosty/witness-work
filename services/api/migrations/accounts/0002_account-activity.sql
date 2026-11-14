CREATE TABLE `account_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`session_id` text,
	`session_platform` text,
	`session_device` text,
	`actor_session_id` text,
	`actor_platform` text,
	`actor_device` text,
	`slot_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_activity_account_idx` ON `account_activity` (`account_id`,`id`);--> statement-breakpoint
CREATE INDEX `account_activity_created_idx` ON `account_activity` (`created_at`);