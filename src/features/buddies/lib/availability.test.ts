import { describe, expect, it } from 'vitest'
import { buddiesAvailability } from '@/features/buddies/lib/availability'

describe('buddiesAvailability', () => {
  it('shows Buddies wherever this device has an account key', () => {
    expect(
      buddiesAvailability({ nativeAvailable: true, relayDisabled: false })
    ).toBe('enabled')
  })

  it('hides Buddies without an account key, such as a signed-out browser', () => {
    expect(
      buddiesAvailability({ nativeAvailable: false, relayDisabled: false })
    ).toBe('hidden')
    expect(
      buddiesAvailability({ nativeAvailable: false, relayDisabled: true })
    ).toBe('hidden')
  })

  it('dims Buddies while the relay is switched off', () => {
    expect(
      buddiesAvailability({ nativeAvailable: true, relayDisabled: true })
    ).toBe('disabled')
  })
})
