import { describe, expect, it } from 'vitest'
import { PlayIntegrityError, codeFromNativeError } from './errorCodes'

describe('codeFromNativeError', () => {
  it('reads the rejection code', () => {
    expect(
      codeFromNativeError({
        code: 'PLAY_INTEGRITY_PLAY_SERVICES_VERSION_OUTDATED',
      })
    ).toBe('playServicesOutdated')
  })

  it('falls back to the token embedded in the message', () => {
    expect(
      codeFromNativeError(
        new Error(
          'Call to function failed: Play Integrity operation failed (PLAY_INTEGRITY_NETWORK_ERROR)'
        )
      )
    ).toBe('network')
  })

  it('keeps an already-classified error', () => {
    expect(codeFromNativeError(new PlayIntegrityError('providerInvalid'))).toBe(
      'providerInvalid'
    )
  })

  it.each([
    null,
    'PLAY_INTEGRITY_NETWORK_ERROR',
    { code: 'E_SOMETHING_ELSE', message: 'localized text' },
    { message: 'PLAY_INTEGRITY_NOT_A_REAL_CODE' },
  ])('returns unknown for %j', (value) => {
    expect(codeFromNativeError(value)).toBe('unknown')
  })
})
