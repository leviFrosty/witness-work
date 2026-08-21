import { describe, expect, it } from 'vitest'
import {
  AppAttestError,
  codeFromNativeError,
  type AppAttestErrorCode,
} from './errorCodes'

/** The shape expo-modules-jsi >= 57.0.2 delivers: `code` survives rejection. */
const codedRejection = (token: string): Error =>
  Object.assign(new Error(`App Attest operation failed (${token})`), {
    code: token,
  })

/**
 * The shape expo-modules-jsi 57.0.1 delivered: `JavaScriptPromise.reject`
 * stringified the `Exception` into a bare `Error`, dropping `code` entirely.
 */
const uncodedRejection = (token: string): Error =>
  new Error(`App Attest operation failed (${token})`)

const CASES: [string, AppAttestErrorCode][] = [
  ['APP_ATTEST_UNSUPPORTED', 'unsupported'],
  ['APP_ATTEST_INVALID_ARGUMENT', 'invalidArgument'],
  ['APP_ATTEST_INVALID_INPUT', 'invalidInput'],
  ['APP_ATTEST_INVALID_KEY', 'invalidKey'],
  ['APP_ATTEST_SERVER_UNAVAILABLE', 'serverUnavailable'],
  ['APP_ATTEST_SYSTEM_FAILURE', 'systemFailure'],
  ['APP_ATTEST_UNKNOWN', 'unknown'],
]

describe('codeFromNativeError', () => {
  it.each(CASES)('maps the %s code property to %s', (token, expected) => {
    expect(codeFromNativeError(codedRejection(token))).toBe(expected)
  })

  it.each(CASES)(
    'recovers %s from the message when the code is dropped',
    (token, expected) => {
      expect(codeFromNativeError(uncodedRejection(token))).toBe(expected)
    }
  )

  /**
   * Both shapes below were captured from a simulator run rather than assumed.
   * Under >= 57.0.2 the message is `Exception.debugDescription`, so the leading
   * token comes from the exception name and the Swift `description` is unused;
   * under 57.0.1 the message is the `description` and there is no `code`.
   */
  it('classifies the message shape expo-modules-jsi 57.0.4 produces', () => {
    const error = Object.assign(
      new Error(
        'APP_ATTEST_UNSUPPORTED: undefined reason (at ExpoModulesCore/Promise.swift:65)'
      ),
      { code: 'APP_ATTEST_UNSUPPORTED' }
    )
    expect(codeFromNativeError(error)).toBe('unsupported')
  })

  it('classifies that shape even if the code property regresses away', () => {
    expect(
      codeFromNativeError(
        new Error(
          'APP_ATTEST_INVALID_KEY: undefined reason (at ExpoModulesCore/Promise.swift:65)'
        )
      )
    ).toBe('invalidKey')
  })

  it('keeps our own precondition failure distinct from Apple invalidInput', () => {
    expect(
      codeFromNativeError(codedRejection('APP_ATTEST_INVALID_ARGUMENT'))
    ).toBe('invalidArgument')
    expect(
      codeFromNativeError(codedRejection('APP_ATTEST_INVALID_INPUT'))
    ).toBe('invalidInput')
  })

  it('prefers the code property over a conflicting message token', () => {
    const error = Object.assign(
      new Error('App Attest operation failed (APP_ATTEST_UNSUPPORTED)'),
      { code: 'APP_ATTEST_INVALID_KEY' }
    )
    expect(codeFromNativeError(error)).toBe('invalidKey')
  })

  it('passes an already-classified AppAttestError through', () => {
    expect(codeFromNativeError(new AppAttestError('serverUnavailable'))).toBe(
      'serverUnavailable'
    )
  })

  it('falls back to unknown for an unrecognized token', () => {
    expect(
      codeFromNativeError(
        Object.assign(new Error('nope'), { code: 'APP_ATTEST_NOPE' })
      )
    ).toBe('unknown')
  })

  it('falls back to unknown for errors carrying no App Attest token', () => {
    expect(codeFromNativeError(new Error('Network request failed'))).toBe(
      'unknown'
    )
    expect(codeFromNativeError(null)).toBe('unknown')
    expect(codeFromNativeError('APP_ATTEST_INVALID_KEY')).toBe('unknown')
  })
})
