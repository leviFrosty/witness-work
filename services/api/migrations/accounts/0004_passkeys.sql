CREATE TABLE `passkey_wraps` (
	`wrap_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`account_id` text NOT NULL,
	`key_epoch` integer NOT NULL,
	`wrap` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`credential_id`, `wrap_id`),
	FOREIGN KEY (`credential_id`) REFERENCES `passkeys`(`credential_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_wraps_credential_idx` ON `passkey_wraps` (`credential_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `passkey_wraps_account_idx` ON `passkey_wraps` (`account_id`);--> statement-breakpoint
CREATE TABLE `passkeys` (
	`credential_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`aaguid` text,
	`rp_id` text NOT NULL,
	`created_platform` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkeys_account_idx` ON `passkeys` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `used_token_ids` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`session_id` text,
	`request_hash` text
);
--> statement-breakpoint
CREATE INDEX `used_token_ids_expires_idx` ON `used_token_ids` (`expires_at`);--> statement-breakpoint
ALTER TABLE `account_activity` ADD `method` text;--> statement-breakpoint
ALTER TABLE `account_activity` ADD `credential_id` text;--> statement-breakpoint
ALTER TABLE `account_sessions` ADD `app_version` text;--> statement-breakpoint
ALTER TABLE `account_sessions` ADD `method` text;--> statement-breakpoint
ALTER TABLE `account_sessions` ADD `key_epoch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `account_sessions` ADD `step_up_at` integer;--> statement-breakpoint
ALTER TABLE `account_sessions` ADD `step_up_credential_id` text;--> statement-breakpoint
ALTER TABLE `account_sessions` ADD `ended_reason` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `passkey_user_handle` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `key_epoch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `created_via` text DEFAULT 'app' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_passkey_user_handle_unique` ON `accounts` (`passkey_user_handle`);