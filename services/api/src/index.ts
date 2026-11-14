import type { Environment } from "./types";
import { runRatingsSweepStep } from "./appStoreRatings/ratings";
import { Sentry, captureFailure, createSentryConfig } from "./sentry";
import { app } from "./app";
import { accountsDb } from "./accounts/store";
import { pruneEndedSessions } from "./accounts/sessionStore";
import { pruneActivity } from "./accounts/activity";
import { pruneSupporterRecords } from "./accounts/supporter";
import { pruneUsedTokens } from "./accounts/passkeyStore";
import { pruneInboxSuccessors } from "./accounts/inboxSuccessors";

/**
 * Deletes account sessions that ended over a week ago, activity entries
 * over 400 days old, RevenueCat webhook event ids over 30 days old,
 * RevenueCat customers no account links, used passkey challenge and
 * ticket ids whose tokens expired, and Buddies inbox successors over 90 days
 * old; failures only report.
 */
async function pruneAccountSessions(environment: Environment): Promise<void> {
  if (!environment.ACCOUNTS_DB) return;
  const db = accountsDb(environment.ACCOUNTS_DB);
  try {
    await pruneEndedSessions(db);
  } catch (error) {
    console.error("accounts: pruning ended sessions failed");
    captureFailure(error, "session prune");
  }
  try {
    await pruneActivity(db);
  } catch (error) {
    console.error("accounts: pruning activity failed");
    Sentry.captureException(error);
  }
  try {
    await pruneSupporterRecords(db);
  } catch (error) {
    console.error("accounts: pruning supporter records failed");
    captureFailure(error, "supporter prune");
  }
  try {
    await pruneUsedTokens(db);
  } catch (error) {
    console.error("accounts: pruning used token ids failed");
    captureFailure(error, "used token prune");
  }
  try {
    await pruneInboxSuccessors(db);
  } catch (error) {
    console.error("accounts: pruning inbox successors failed");
    captureFailure(error, "inbox successor prune");
  }
}

// Durable Object classes must be re-exported from the entry module so Wrangler
// can bind them (see wrangler.toml [[durable_objects.bindings]] + migrations).
export { NotesImportRun } from "./notesImport/runDO";
export { NotesImportIndex } from "./notesImport/indexDO";
export { AppAttestIdentity } from "./appAttest/identityDO";
export { PlayIntegrityChallenges } from "./playIntegrity/challengeDO";
export { BuddyInbox } from "./buddies/inboxDO";
export { BuddyInvite } from "./buddies/inviteDO";
export { RoutePlanningQuota } from "./routePlanning/quotaDO";
export { BuddyRegistrationQuota } from "./buddies/registrationQuota";
export { AccountHandoff } from "./accounts/handoffDO";
export { AccountSync } from "./accounts/syncDO";
export { SharedSpace } from "./spaces/spaceDO";
export { ScribeMeter } from "./scribe/meterDO";
export { AccountRateCounter } from "./accounts/rateCounterDO";
export { AccountApproval } from "./accounts/approvalDO";

export default Sentry.withSentry(
  (environment: Environment) => createSentryConfig(environment),
  {
    async fetch(
      request: Request,
      environment: Environment,
      context: ExecutionContext
    ): Promise<Response> {
      return app.fetch(request, environment, context);
    },
    async scheduled(
      _controller: ScheduledController,
      environment: Environment,
      context: ExecutionContext
    ): Promise<void> {
      // Hourly (wrangler.toml [triggers]); idle once a weekly sweep is done.
      context.waitUntil(runRatingsSweepStep({ kv: environment.NOTES_KV }));
      context.waitUntil(pruneAccountSessions(environment));
    },
  } satisfies ExportedHandler<Environment>
);
