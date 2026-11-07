import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createAccountSessions } from '@/lib/serverAccount/session'
import { refreshSession } from '@/lib/serverAccount/sessionClient'
import {
  interopDevBypass,
  interopEnabled,
  interopRelayUrl,
} from '@/lib/serverAccount/testing/interopSessions'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

const baseUrl = interopRelayUrl!
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

describe.skipIf(!interopEnabled)('session refresh against the worker', () => {
  it('picks up a rotation whose answer was lost, and still ends the session on a real reuse', async () => {
    const accountKey = random(32)
    let stored: string | null = null
    const sessions = createAccountSessions({
      baseUrl,
      now: Date.now,
      randomBytes: random,
      attestation: {
        assert: (request) =>
          request.submit({ kind: 'devBypass', token: interopDevBypass! }),
      },
      store: {
        read: async () => stored,
        write: async (value) => {
          stored = value
        },
      },
      accountKey: async () => accountKey,
    })
    await sessions.ensure(accountKey)
    const first = JSON.parse(stored!).refreshToken as string

    let sent = 0
    const losing: typeof fetch = async (input, init) => {
      const response = await fetch(input, init)
      if (++sent === 1) throw new TypeError('Network request failed')
      return response
    }
    const retried = await refreshSession(first, {
      baseUrl,
      fetchImpl: losing,
    })
    expect(sent).toBe(2)
    expect(retried.refreshToken).not.toBe(first)

    const next = await refreshSession(retried.refreshToken, { baseUrl })
    expect(next.refreshToken).not.toBe(retried.refreshToken)

    await expect(refreshSession(first, { baseUrl })).rejects.toMatchObject({
      status: 401,
      body: expect.objectContaining({ reason: 'reused' }),
    })
    await expect(
      refreshSession(next.refreshToken, { baseUrl })
    ).rejects.toMatchObject({
      status: 401,
      body: expect.objectContaining({ reason: 'reused' }),
    })
  })
})
