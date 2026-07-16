import { describe, expect, it } from 'vitest'
import { isLocationTemporarilyUnavailableError } from '@/lib/locationError'

describe('isLocationTemporarilyUnavailableError', () => {
  it.each([
    'The operation couldn’t be completed. (kCLErrorDomain error 0.)',
    'The operation couldn’t be completed. (kCLErrorDomain Code=0)',
    'kCLErrorLocationUnknown',
  ])('recognizes a temporarily unavailable location: %s', (message) => {
    expect(isLocationTemporarilyUnavailableError(new Error(message))).toBe(true)
  })

  it('does not hide other Core Location failures', () => {
    expect(
      isLocationTemporarilyUnavailableError(
        new Error('The operation failed. (kCLErrorDomain error 1.)')
      )
    ).toBe(false)
  })
})
