import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}${JSON.stringify(options)}` : key,
  },
}))
vi.mock('@/lib/dates', () => ({ formatDate: (ms: number) => `day ${ms}` }))
vi.mock('@/lib/numbers', () => ({ localizeAppDigits: (text: string) => text }))

import { endedText, signInProblemText } from '@/app/web-sign-in/signInCopy'
import { HttpError } from '@/lib/http/request'
import { AccountSessionError } from '@/lib/serverAccount/session'
import { webSignInFailureFor } from '@/lib/serverAccount/webSignIn'

describe('why the server signed this browser out', () => {
  it('says the key changed elsewhere, with when, and how to get back in', () => {
    expect(endedText('key_changed', 1_799_000_000_000)).toBe(
      'accountKeyChange_elsewhereBody{"date":"day 1799000000000"} accountKeyChange_elsewhereHowWeb'
    )
  })

  it('says the key changed without a date the server didn’t give', () => {
    expect(endedText('key_changed', null)).toBe(
      'accountKeyChange_elsewhereBodyNoDate accountKeyChange_elsewhereHowWeb'
    )
  })

  it('still says the plain reasons', () => {
    expect(endedText('revoked')).toBe('webSignIn_endedRevoked')
    expect(endedText(null)).toBeNull()
  })
})

describe('a recovery key a key change replaced', () => {
  const problem = (changedAt: number | null) => ({
    method: 'recovery' as const,
    failure: 'keyRetired' as const,
    retryAfterMs: null,
    changedAt,
  })

  it('says when it was replaced', () => {
    expect(signInProblemText(problem(1_799_000_000_000))).toBe(
      'webSignIn_problemKeyRetiredOn{"date":"day 1799000000000"}'
    )
  })

  it('says it was replaced without a date the server didn’t give', () => {
    expect(signInProblemText(problem(null))).toBe('webSignIn_problemKeyRetired')
  })

  it('reads when from the server’s refusal', () => {
    const refused = new HttpError(
      'client',
      403,
      'key_retired',
      null,
      undefined,
      {
        error: 'key_retired',
        changedAt: 1_799_000_000_000,
      }
    )
    expect(webSignInFailureFor(refused)).toMatchObject({
      failure: 'keyRetired',
      changedAt: 1_799_000_000_000,
    })
    const opened = new AccountSessionError('keyRetired', {
      serverCode: 'key_retired',
      changedAt: 1_799_000_000_001,
    })
    expect(webSignInFailureFor(opened)).toMatchObject({
      failure: 'keyRetired',
      changedAt: 1_799_000_000_001,
    })
  })
})
