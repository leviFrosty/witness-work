import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ pending: true }))

vi.mock('@/features/scribe/stores/consent', () => ({
  scribeTermsPending: () => runtime.pending,
}))

import {
  askScribeConsent,
  settleScribeConsent,
} from '@/features/scribe/components/scribeConsentGate'

describe('askScribeConsent', () => {
  beforeEach(() => {
    runtime.pending = true
    settleScribeConsent(false)
  })

  it('goes straight on once this device has agreed', async () => {
    runtime.pending = false
    const navigation = { navigate: vi.fn() }
    await expect(askScribeConsent(navigation)).resolves.toBe(true)
    expect(navigation.navigate).not.toHaveBeenCalled()
  })

  it('opens the Terms of Use and waits for the answer', async () => {
    const navigation = { navigate: vi.fn() }
    const answer = askScribeConsent(navigation, { surface: 'settings' })
    expect(navigation.navigate).toHaveBeenCalledWith('ScribeConsent', {
      surface: 'settings',
    })
    settleScribeConsent(true)
    await expect(answer).resolves.toBe(true)
  })

  it('answers no when the sheet is dismissed', async () => {
    const answer = askScribeConsent({ navigate: vi.fn() })
    settleScribeConsent(false)
    await expect(answer).resolves.toBe(false)
  })

  it('answers no to an earlier request that a newer one replaces', async () => {
    const navigation = { navigate: vi.fn() }
    const first = askScribeConsent(navigation)
    const second = askScribeConsent(navigation)
    await expect(first).resolves.toBe(false)
    settleScribeConsent(true)
    await expect(second).resolves.toBe(true)
  })
})
