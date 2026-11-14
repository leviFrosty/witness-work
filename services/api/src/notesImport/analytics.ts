import type { LanguageModelUsage } from 'ai'
import type { AnalyticsEvent } from '../analytics'
import type { CreditsSnapshot } from '../credits'
import { isEmptyImportResult, type NotesImportResult } from './schema'

/**
 * Notes Import usage events (PostHog, via `src/analytics.ts`). They answer:
 * how many people run imports and how often, whether runs succeed, what they
 * cost in tokens, and how often free users hit their allowance. The server sees
 * every import, including installs that turned app analytics off, so these
 * stay anonymous and structural: never notes text, model output, or ids.
 *
 * - `api_notes_import_started`: an attested import began a fresh model run
 *   (kickoff or legacy). Reconnects and replays of a settled run don't count.
 * - `api_notes_import_finished`: one per started run, with its `outcome`.
 * - `api_notes_import_limit_reached`: an authenticated request was refused by
 *   the import or refinement allowance, or the concurrency cap.
 */
export const NOTES_IMPORT_EVENTS = {
  started: 'api_notes_import_started',
  finished: 'api_notes_import_finished',
  limitReached: 'api_notes_import_limit_reached',
} as const

/**
 * A bearer request's session platform. Legacy: `ios` (App Attest), `android`
 * (Play Integrity), or `dev` for the dev-bypass header. `dev` exists on a
 * local development worker only.
 */
export type NotesImportPlatform = 'ios' | 'android' | 'dev' | 'web'

export type NotesImportTransport = 'stream' | 'legacy'

export type NotesImportOutcome =
  | 'success'
  | 'model_error'
  | 'cancelled'
  | 'interrupted'

export type NotesImportLimit = 'imports' | 'refinements' | 'active_cap'

/**
 * Frozen at the attested kickoff and carried in the run DO's input, so the
 * terminal event shares the kickoff's breakdowns. Structured-clone-safe.
 */
export interface NotesImportAnalyticsContext {
  /**
   * `analyticsDistinctId(meterId)`, the session's account id on bearer
   * requests; never the meter id itself.
   */
  distinctId: string
  platform: NotesImportPlatform
  transport: NotesImportTransport
  refinement: boolean
  /** Real entitlement at kickoff (the dev bypass never implies it). */
  supporter: boolean
  /**
   * A bearer request (an account session), or a legacy client that sent a
   * shared account id (ADR 0011), not just an install uuid.
   */
  hasAccount: boolean
  notesChars: number
  /** Epoch ms when the run started; `duration_ms` is measured from here. */
  startedAt: number
}

type BaseContext = Omit<NotesImportAnalyticsContext, 'notesChars' | 'startedAt'>

const baseProperties = (context: BaseContext) => ({
  platform: context.platform,
  transport: context.transport,
  refinement: context.refinement,
  supporter: context.supporter,
  has_account: context.hasAccount,
})

export const notesImportStartedEvent = (
  context: NotesImportAnalyticsContext,
  decision: { isNewHash: boolean; remaining: number | null }
): AnalyticsEvent => ({
  event: NOTES_IMPORT_EVENTS.started,
  distinctId: context.distinctId,
  properties: {
    ...baseProperties(context),
    notes_chars: context.notesChars,
    /** False when the same notes were imported before (no new charge). */
    new_content: decision.isNewHash,
    /** Projected import balance after success; null is unlimited. */
    imports_remaining: decision.remaining,
  },
})

/** Details only a successful run has. */
export interface NotesImportSuccessDetails {
  result: NotesImportResult
  credits: CreditsSnapshot
  emptyCharged: boolean
  model: string
  provider?: string
  usage: LanguageModelUsage
}

export const notesImportFinishedEvent = (
  context: NotesImportAnalyticsContext,
  outcome: NotesImportOutcome,
  now: number,
  success?: NotesImportSuccessDetails
): AnalyticsEvent => ({
  event: NOTES_IMPORT_EVENTS.finished,
  distinctId: context.distinctId,
  properties: {
    ...baseProperties(context),
    outcome,
    duration_ms: Math.max(0, now - context.startedAt),
    notes_chars: context.notesChars,
    ...(success && {
      // Settlement re-resolves entitlement; report the authoritative one.
      supporter: success.credits.isSupporter,
      empty: isEmptyImportResult(success.result),
      empty_charged: success.emptyCharged,
      contacts: success.result.contacts.length,
      visits: success.result.visits.length,
      time_entries: success.result.timeEntries.length,
      categories: success.result.categories.length,
      warnings: success.result.warnings.length,
      publisher_detected: success.result.publisher != null,
      imports_remaining: success.credits.remaining,
      model: success.model,
      provider: success.provider ?? null,
      input_tokens: success.usage.inputTokens ?? null,
      output_tokens: success.usage.outputTokens ?? null,
      reasoning_tokens: success.usage.reasoningTokens ?? null,
    }),
  },
})

export const notesImportLimitReachedEvent = (
  context: BaseContext,
  limit: NotesImportLimit
): AnalyticsEvent => ({
  event: NOTES_IMPORT_EVENTS.limitReached,
  distinctId: context.distinctId,
  properties: { ...baseProperties(context), limit },
})
