import type { OfferStartProblem } from '@/app/account/handoff'
import type {
  HandoffFailure,
  OfferSession,
  OfferState,
} from '@/lib/serverAccount/handoffSession'

export type HandoffStart =
  | { phase: 'starting' }
  | { phase: 'problem'; problem: OfferStartProblem }
  | { phase: 'ready'; session: OfferSession }

export const RETRYABLE_PROBLEMS: ReadonlySet<OfferStartProblem> = new Set([
  'unavailable',
  'verifyLater',
  'offline',
])

export const FINAL_FAILURES: ReadonlySet<HandoffFailure> = new Set([
  'unverified',
  'updateRequired',
])

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
