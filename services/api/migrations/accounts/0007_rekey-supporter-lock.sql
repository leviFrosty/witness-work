CREATE TABLE `revenuecat_customer_locks` (
	`app_user_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`locked_until` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `revenuecat_customer_locks_until_idx` ON `revenuecat_customer_locks` (`locked_until`);--> statement-breakpoint
ALTER TABLE `account_revenuecat_customers` ADD `first_linked_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `revenuecat_customers` ADD `original_app_user_id` text;--> statement-breakpoint
-- Links from before this column: their linked_at is the best first link time known.
UPDATE `account_revenuecat_customers` SET `first_linked_at` = `linked_at`;
