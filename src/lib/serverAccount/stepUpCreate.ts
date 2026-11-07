import type { StepUpResult } from '@/lib/serverAccount/stepUp'

export const TAP_FRESH_MS = 3_000

export type CreateGate =
  | { status: 'go'; timeoutMs: number }
  | { status: 'cancelled' }
  | { status: 'expired' }

export type CreateGateDeps = {
  elapsed: () => number

  askContinue: (until: number) => Promise<'continue' | 'cancelled' | 'expired'>
}

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
