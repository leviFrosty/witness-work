/**
 * What this build can take from ww-api, sent on session open, every refresh,
 * web sign-up, and `GET /app/v1/config` (`docs/accounts-protocol.md`).
 *
 * - `sync-everyone`: this build turns Cloud Sync on by itself only for a new
 *   install, so ww-api may give it Cloud Sync for everyone (ADR 0040 §2).
 *   Without it, Cloud Sync stays a Supporter benefit for that session.
 */
export const SESSION_CAPABILITIES = ['sync-everyone'] as const
