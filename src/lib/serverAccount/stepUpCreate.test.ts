import { describe, expect, it, vi } from 'vitest'
import { gateWebCreate, TAP_FRESH_MS } from '@/lib/serverAccount/stepUpCreate'
import type { StepUpResult } from '@/lib/serverAccount/stepUp'

const T0 = 10_000

const passkey = (until: number): StepUpResult =>
  ({
    status: 'confirmed',
    via: 'passkey',
    rpId: 'app.witnesswork.app',
    credentialIds: ['Y3JlZA'],
    assertion: { response: {}, prf: null },
    challenge: 'Y2g',
    until,
  }) as never

const session = (until: number): StepUpResult => ({
  status: 'confirmed',
  via: 'session',
  until,
})

function setup(
  now = T0,
  answer: 'continue' | 'cancelled' | 'expired' = 'continue'
) {
  const elapsed = vi.fn(() => now)
  const askContinue = vi.fn(async () => {
    elapsed.mockReturnValue(now + 2_000)
    return answer
  })
  return { elapsed, askContinue }
}

describe('gateWebCreate', () => {
  it('asks for a second tap after a passkey step-up, then caps the prompt to the step-up’s end', async () => {
    const deps = setup()
    const gate = await gateWebCreate(passkey(T0 + 60_000), T0 - 500, deps)
    expect(deps.askContinue).toHaveBeenCalledExactlyOnceWith(T0 + 60_000)
    expect(gate).toEqual({ status: 'go', timeoutMs: 58_000 })
  })

  it('goes straight on from a fresh tap inside the server’s window', async () => {
    const deps = setup()
    const gate = await gateWebCreate(session(T0 + 60_000), T0 - 500, deps)
    expect(deps.askContinue).not.toHaveBeenCalled()
    expect(gate).toEqual({ status: 'go', timeoutMs: 60_000 })
  })

  it('asks for a second tap once the first is too old to count', async () => {
    const deps = setup()
    await gateWebCreate(session(T0 + 60_000), T0 - TAP_FRESH_MS - 1, deps)
    expect(deps.askContinue).toHaveBeenCalledOnce()
  })

  it('never starts past the step-up’s end', async () => {
    const deps = setup()
    expect(await gateWebCreate(session(T0), T0 - 500, deps)).toEqual({
      status: 'expired',
    })
    expect(deps.askContinue).not.toHaveBeenCalled()
    // Nor when the second tap came too late.
    const late = setup()
    expect(await gateWebCreate(passkey(T0 + 1_000), T0, late)).toEqual({
      status: 'expired',
    })
  })

  it('passes the second tap’s cancel and expiry on', async () => {
    expect(
      await gateWebCreate(passkey(T0 + 60_000), T0, setup(T0, 'cancelled'))
    ).toEqual({ status: 'cancelled' })
    expect(
      await gateWebCreate(passkey(T0 + 60_000), T0, setup(T0, 'expired'))
    ).toEqual({ status: 'expired' })
  })

  it('refuses without a confirmed step-up', async () => {
    expect(await gateWebCreate(null, T0, setup())).toEqual({
      status: 'expired',
    })
    expect(await gateWebCreate({ status: 'cancelled' }, T0, setup())).toEqual({
      status: 'expired',
    })
  })
})
