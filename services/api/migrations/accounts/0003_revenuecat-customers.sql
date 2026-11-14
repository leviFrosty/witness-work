CREATE TABLE `account_revenuecat_customers` (
	`account_id` text NOT NULL,
	`app_user_id` text NOT NULL,
	`linked_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `app_user_id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_user_id`) REFERENCES `revenuecat_customers`(`app_user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_revenuecat_customers_customer_idx` ON `account_revenuecat_customers` (`app_user_id`);--> statement-breakpoint
CREATE TABLE `revenuecat_customers` (
	`app_user_id` text PRIMARY KEY NOT NULL,
	`supporter` integer NOT NULL,
	`supporter_expires_at` integer,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `revenuecat_webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `revenuecat_webhook_events_received_idx` ON `revenuecat_webhook_events` (`received_at`);