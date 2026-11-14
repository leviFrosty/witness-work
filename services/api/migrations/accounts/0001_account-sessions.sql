CREATE TABLE `account_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`platform` text NOT NULL,
	`device` text,
	`refresh_hash` text NOT NULL,
	`previous_refresh_hash` text,
	`rotated_at` integer,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_sessions_refresh_hash_unique` ON `account_sessions` (`refresh_hash`);--> statement-breakpoint
CREATE INDEX `account_sessions_account_idx` ON `account_sessions` (`account_id`);--> statement-breakpoint
CREATE INDEX `account_sessions_previous_refresh_idx` ON `account_sessions` (`previous_refresh_hash`);