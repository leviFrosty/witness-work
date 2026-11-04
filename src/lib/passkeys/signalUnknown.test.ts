import { describe, expect, it, vi } from 'vitest'
import { signalRemovedPasskey } from '@/lib/passkeys/signalUnknown'

const chromium = { userAgentData: { brands: [{ brand: 'Chromium' }] } }

describe('signalRemovedPasskey', () => {
  it('asks a Chromium browser to forget the passkey', () => {
    const signalUnknownCredential = vi.fn(async () => undefined)
    expect(
      signalRemovedPasskey('app.witnesswork.app', 'Y3JlZA', {
        credential: { signalUnknownCredential },
        navigator: chromium,
      })
    ).toBe(true)
    expect(signalUnknownCredential).toHaveBeenCalledExactlyOnceWith({
      rpId: 'app.witnesswork.app',
      credentialId: 'Y3JlZA',
    })
  })

  it('never asks Safari or another WebKit browser', () => {
    const signalUnknownCredential = vi.fn(async () => undefined)
    expect(
      signalRemovedPasskey('app.witnesswork.app', 'Y3JlZA', {
        credential: { signalUnknownCredential },
        navigator: {},
      })
    ).toBe(false)
    expect(signalUnknownCredential).not.toHaveBeenCalled()
  })

  it('does nothing where the browser can’t, and never throws', async () => {
    expect(
      signalRemovedPasskey('rp', 'id', { credential: {}, navigator: chromium })
    ).toBe(false)
    const failing = vi.fn(async () => {
      throw new Error('nope')
    })
    expect(
      signalRemovedPasskey('rp', 'id', {
        credential: { signalUnknownCredential: failing },
        navigator: chromium,
      })
    ).toBe(true)
    await Promise.resolve()
  })
})
