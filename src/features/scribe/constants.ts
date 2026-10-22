/** A recording ends on its own after this long (`reason: 'cap'`). */
export const SCRIBE_VOICE_MAX_MS = 180_000
/** Silence after speech this long shows the pause hint. */
export const SCRIBE_VOICE_QUIET_MS = 3_000
/** Discard asks for confirmation after this much recording. */
export const SCRIBE_VOICE_DISCARD_CONFIRM_MS = 15_000
/** `remainingMs` counts down over the last this-much of a recording. */
export const SCRIBE_VOICE_COUNTDOWN_MS = 20_000
/** How long an applied Proposal can be undone. */
export const SCRIBE_UNDO_WINDOW_DAYS = 30

/** A read tool that takes longer fails with an instructive error. */
export const SCRIBE_READ_TIMEOUT_MS = 5_000
/** Context budget thresholds of `maxInputTokens` (protocol: Context budget). */
export const SCRIBE_BUDGET_NEAR_FULL = 0.75
export const SCRIBE_BUDGET_FULL = 0.9
/** `GET /usage` at most this often. */
export const SCRIBE_USAGE_MIN_INTERVAL_MS = 30_000
/** Status is read again on returning to the app once it's this old. */
export const SCRIBE_STATUS_STALE_MS = 5 * 60_000
/**
 * Paper pages per pick (one batch), and how many are read at once. The daily
 * page limit is ww-api's (`transcribe_limit`).
 */
export const SCRIBE_PAPER_MAX_PAGES = 10
export const SCRIBE_PAPER_CONCURRENCY = 2
