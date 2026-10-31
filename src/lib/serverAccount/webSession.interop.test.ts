import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '@/lib/http/request'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import { mintLiveTicket } from '@/lib/serverAccount/liveTicket'
import { webRecovery } from '@/lib/serverAccount/passkeyClient'
import {
  closeSession,
  refreshSession,
  sendWebSessionOpen,
} from '@/lib/serverAccount/sessionClient'
import {
  interopAccount,
  interopEnabled,
  interopRelayUrl,
} from '@/lib/serverAccount/testing/interopSessions'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

/**
 * Opt-in contract check of a browser's web session against a real worker (see
 * `interopSessions`): a recovery ticket opens it with `capabilities`, a lost
 * answer is the same signed request again, refresh slides it, a live ticket
 * mints with it, and a closed session's refresh says `revoked`. Skipped by
 * default. Recovery uses Turnstile's test token, which the dev and local
 * workers' test keys pass; it counts against the worker's per-IP cap.
 */
const baseUrl = interopRelayUrl!
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'
const DAY = 24 * 60 * 60 * 1000

describe.skipIf(!interopEnabled)('web sessions against the worker', () => {
  it('opens, repeats, refreshes, mints a live ticket, and ends', async () => {
    // A phone made the account; the browser has only its recovery key.
    const phone = await interopAccount(random)
    const key = deriveAccountSigningKey(phone.accountKey)
    const sign = { baseUrl, key, now: Date.now, randomBytes: random }
    const { ticket, accountId } = await webRecovery(
      { turnstileToken: TURNSTILE_TEST_TOKEN },
      sign
    )
    expect(accountId).toBe(phone.accountId)

    const sent: string[] = []
    const recording: typeof fetch = (input, init) => {
      if (String(input).endsWith('/accounts/v1/sessions'))
        sent.push(String(init?.body))
      return fetch(input, init)
    }
    const opened = await sendWebSessionOpen(
      { ticket, appVersion: '9.9.9' },
      { ...sign, fetchImpl: recording }
    )
    expect(opened.accountId).toBe(phone.accountId)
    expect(opened.sessionExpiresAt).toBeGreaterThan(Date.now() + 179 * DAY)

    // The answer was lost: the same signed request gets the same session.
    const repeat = await fetch(`${baseUrl}/accounts/v1/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: sent[0],
    })
    const repeated = (await repeat.json()) as Record<string, unknown>
    expect(repeated).toMatchObject({
      ok: true,
      sessionId: opened.sessionId,
      refreshToken: opened.refreshToken,
    })

    const sessions = (
      await phone.sessions.request<{
        sessions: { sessionId: string; platform: string; appVersion?: string }[]
      }>({
        url: `${baseUrl}/accounts/v1/sessions`,
        method: 'GET',
        timeoutMs: 15_000,
      })
    ).data.sessions
    expect(
      sessions.find((session) => session.sessionId === opened.sessionId)
    ).toMatchObject({ platform: 'web', appVersion: '9.9.9' })

    const refreshed = await refreshSession(opened.refreshToken, {
      baseUrl,
      appVersion: '9.9.9',
    })
    expect(refreshed.refreshToken).not.toBe(opened.refreshToken)

    const live = await mintLiveTicket(
      { socket: 'sync', id: 'AAAAAAAAAAAAAAAAAAAAAA' },
      {
        baseUrl,
        authorize: (run) => run(`Bearer ${refreshed.accessToken}`),
      }
    )
    expect(live.ticket).toMatch(/^[A-Za-z0-9_.-]+$/)
    expect(live.ticket).not.toContain(refreshed.accessToken)

    await closeSession(refreshed.accessToken, { baseUrl })
    const ended = await refreshSession(refreshed.refreshToken, {
      baseUrl,
    }).catch((error: unknown) => error)
    expect(ended).toBeInstanceOf(HttpError)
    expect((ended as HttpError).status).toBe(401)
    expect((ended as HttpError).body).toMatchObject({ reason: 'revoked' })
  })
})
