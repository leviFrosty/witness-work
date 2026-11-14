ALTER TABLE `account_inboxes` ADD `first_key_epoch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Links from before this column: their current `key_epoch`. That's the epoch
-- they were first linked at unless a registration with a newer key's proof
-- has moved them up since (ADR 0039 §5, migration 0008), which only a device
-- holding the newer key can do.
UPDATE `account_inboxes` SET `first_key_epoch` = `key_epoch`;
