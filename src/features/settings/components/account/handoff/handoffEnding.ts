import type { OfferStartProblem } from '@/app/account/handoff'
import type {
  HandoffFailure,
  OfferSession,
  OfferState,
} from '@/lib/serverAccount/handoffSession'

/** Starting the old phone's handoff: its session, or why there's none. */
export type HandoffStart =
  | { phase: 'starting' }
  | { phase: 'problem'; problem: OfferStartProblem }
  | { phase: 'ready'; session: OfferSession }

/** Problems that can pass by themselves. */
export const RETRYABLE_PROBLEMS: ReadonlySet<OfferStartProblem> = new Set([
  'unavailable',
  'verifyLater',
  'offline',
])

/**
 * Failures a new code can't fix: the device can't be verified, or the app needs
 * an update.
 */
export const FINAL_FAILURES: ReadonlySet<HandoffFailure> = new Set([
  'unverified',
  'updateRequired',
])

/**
 * How the handoff ended, if it has: `retry` when a new code could go through,
 * `final` when it finished or can't.
 */
export function handoffEnding(
  start: HandoffStart,
  state: OfferState | null
): 'retry' | 'final' | null {
  if (start.phase === 'problem')
    return RETRYABLE_PROBLEMS.has(start.problem) ? 'retry' : 'final'
  switch (state?.step) {
    case 'failed':
      return FINAL_FAILURES.has(state.reason) ? 'final' : 'retry'
    case 'declined':
    case 'cancelled':
      return 'retry'
    case 'done':
      return 'final'
  }
  return null
}
