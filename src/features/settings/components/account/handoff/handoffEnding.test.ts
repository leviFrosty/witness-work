import { describe, expect, it } from 'vitest'
import type { OfferSession } from '@/lib/serverAccount/handoffSession'
import { handoffEnding } from './handoffEnding'

const ready = { phase: 'ready', session: {} as OfferSession } as const
const hello = { deviceName: 'Pixel', platform: 'android' } as never

describe('handoffEnding', () => {
  it('is null while the handoff is under way', () => {
    expect(handoffEnding({ phase: 'starting' }, null)).toBeNull()
    for (const state of [
      { step: 'idle' },
      { step: 'opening' },
      { step: 'waiting', link: 'x', expiresAt: 1 },
      { step: 'confirm', hello, code: '1', expiresAt: 1 },
      { step: 'sent', hello, code: '1', expiresAt: 1 },
    ] as const)
      expect(handoffEnding(ready, state)).toBeNull()
  })

  it('can retry what a new code may fix', () => {
    expect(handoffEnding(ready, { step: 'failed', reason: 'cancelled' })).toBe(
      'retry'
    )
    expect(handoffEnding(ready, { step: 'declined', hello })).toBe('retry')
    expect(handoffEnding(ready, { step: 'cancelled' })).toBe('retry')
    expect(handoffEnding({ phase: 'problem', problem: 'offline' }, null)).toBe(
      'retry'
    )
  })

  it('is final once it succeeded, or when a new code can’t help', () => {
    expect(handoffEnding(ready, { step: 'done', hello })).toBe('final')
    expect(
      handoffEnding(ready, { step: 'failed', reason: 'updateRequired' })
    ).toBe('final')
    expect(
      handoffEnding({ phase: 'problem', problem: 'unverified' }, null)
    ).toBe('final')
  })
})
