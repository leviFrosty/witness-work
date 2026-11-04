import type { StepUpResult } from '@/lib/serverAccount/stepUp'

/**
 * Before a web passkey's create (docs/passkeys-protocol.md, "Step-up on the
 * web"): the server takes the new passkey only inside the step-up's window, and
 * Safari makes one only from a recent tap. A create that starts after either
 * would leave a passkey in the password manager the server refused, or fail
 * without a word.
 *
 * - Past the step-up's `until` (page clock) it never starts (`expired`).
 * - A passkey step-up used the User's tap for its get, so the sheet asks for a
 *   second (Continue). So does a tap older than `TAP_FRESH_MS`.
 * - The create's prompt is capped to the time the window has left.
 */

/**
 * How long a tap's user activation is trusted for a create. WebKit keeps it
 * about 5 seconds; this leaves room for the request before the create.
 */
export const TAP_FRESH_MS = 3_000

export type CreateGate =
  | { status: 'go'; timeoutMs: number }
  | { status: 'cancelled' }
  | { status: 'expired' }

export type CreateGateDeps = {
  /** The page's monotonic clock. */
  elapsed: () => number
  /** The sheet's Continue, open until `until`. */
  askContinue: (until: number) => Promise<'continue' | 'cancelled' | 'expired'>
}

/**
 * Whether the create may start after `stepUp`, the check whose tap was at
 * `tappedAt` (page clock), and for how long.
 */
export async function gateWebCreate(
  stepUp: StepUpResult | null,
  tappedAt: number,
  deps: CreateGateDeps
): Promise<CreateGate> {
  if (stepUp?.status !== 'confirmed') return { status: 'expired' }
  const { until } = stepUp
  if (deps.elapsed() >= until) return { status: 'expired' }
  const needsTap =
    stepUp.via === 'passkey' || deps.elapsed() - tappedAt > TAP_FRESH_MS
  if (needsTap) {
    const answer = await deps.askContinue(until)
    if (answer !== 'continue') return { status: answer }
  }
  const left = until - deps.elapsed()
  return left > 0 ? { status: 'go', timeoutMs: left } : { status: 'expired' }
}
