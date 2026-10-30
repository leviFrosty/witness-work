import { describe, expect, it } from 'vitest'
import {
  NativePasskeyError,
  codeFromNativeError,
  fromNativeError,
  type PasskeyErrorCode,
} from './errorCodes'

const CASES: [string, PasskeyErrorCode][] = [
  ['PASSKEY_CANCELLED', 'cancelled'],
  ['PASSKEY_NOT_SUPPORTED', 'not_supported'],
  ['PASSKEY_NO_CREDENTIALS', 'no_credentials'],
  ['PASSKEY_TIMEOUT', 'timeout'],
  ['PASSKEY_DOMAIN_NOT_ASSOCIATED', 'domain_not_associated'],
  ['PASSKEY_ALREADY_REGISTERED', 'already_registered'],
  ['PASSKEY_FAILED', 'failed'],
]

describe('codeFromNativeError', () => {
  it.each(CASES)('maps the %s code property to %s', (token, expected) => {
    const error = Object.assign(new Error('Passkey operation failed'), {
      code: token,
    })
    expect(codeFromNativeError(error)).toBe(expected)
  })

  it.each(CASES)(
    'recovers %s from the message when the code is dropped',
    (token, expected) => {
      expect(
        codeFromNativeError(
          new Error(`${token}: Passkey operation failed (${token})`)
        )
      ).toBe(expected)
    }
  )

  it('prefers the code property over a conflicting message token', () => {
    const error = Object.assign(new Error('PASSKEY_FAILED'), {
      code: 'PASSKEY_CANCELLED',
    })
    expect(codeFromNativeError(error)).toBe('cancelled')
  })

  it('falls back to failed for anything else', () => {
    expect(codeFromNativeError(new Error('boom'))).toBe('failed')
    expect(
      codeFromNativeError(
        Object.assign(new Error('x'), { code: 'PASSKEY_NOPE' })
      )
    ).toBe('failed')
    expect(codeFromNativeError(null)).toBe('failed')
    expect(codeFromNativeError('PASSKEY_CANCELLED')).toBe('failed')
  })
})

describe('fromNativeError', () => {
  it('keeps the native message for logs', () => {
    const error = fromNativeError(
      Object.assign(
        new Error('PASSKEY_DOMAIN_NOT_ASSOCIATED: not associated'),
        {
          code: 'PASSKEY_DOMAIN_NOT_ASSOCIATED',
        }
      )
    )
    expect(error).toBeInstanceOf(NativePasskeyError)
    expect(error.code).toBe('domain_not_associated')
    expect(error.nativeMessage).toBe(
      'PASSKEY_DOMAIN_NOT_ASSOCIATED: not associated'
    )
  })

  it('passes a NativePasskeyError through', () => {
    const error = new NativePasskeyError('timeout')
    expect(fromNativeError(error)).toBe(error)
  })
})
