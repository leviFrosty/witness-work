import { describe, expect, it } from 'vitest'
import {
  isExpectedLocationError,
  isLocationOffError,
  isLocationTemporarilyUnavailableError,
} from '@/lib/locationError'

describe('isLocationTemporarilyUnavailableError', () => {
  it.each([
    'The operation couldn’t be completed. (kCLErrorDomain error 0.)',
    'The operation couldn’t be completed. (kCLErrorDomain Code=0)',
    'kCLErrorLocationUnknown',
    'Current location is unknown',
  ])('recognizes a temporarily unavailable location: %s', (message) => {
    expect(isLocationTemporarilyUnavailableError(new Error(message))).toBe(true)
  })

  it('does not treat a denied location as transient', () => {
    expect(
      isLocationTemporarilyUnavailableError(
        new Error('The operation failed. (kCLErrorDomain error 1.)')
      )
    ).toBe(false)
  })
})

describe('isLocationOffError', () => {
  it.each([
    [
      'iOS denied',
      'Cannot obtain current location: The operation couldn’t be completed. (kCLErrorDomain error 1.)',
    ],
    ['iOS denied (Code=)', 'Error Domain=kCLErrorDomain Code=1 "(null)"'],
    ['iOS services off', 'Location services are disabled'],
    ['iOS permission', 'Location permission is required to do this operation'],
    [
      'Android current location',
      'Current location is unavailable. Make sure that location services are enabled',
    ],
    [
      'Android location',
      'Location is unavailable. Make sure that location services are enabled',
    ],
    [
      'Android settings',
      'Location request failed due to unsatisfied device settings',
    ],
    ['Android unauthorized', 'Not authorized to use location services'],
  ])('%s', (_, message) => {
    expect(isLocationOffError(new Error(message))).toBe(true)
    expect(isLocationOffError({ message })).toBe(true)
    expect(isLocationOffError(message)).toBe(true)
  })
})

describe('isExpectedLocationError', () => {
  it.each([
    [
      'kCLErrorDomain error 10',
      'The operation failed. (kCLErrorDomain error 10.)',
    ],
    [
      'kCLErrorDomain error 2',
      'The operation failed. (kCLErrorDomain error 2.)',
    ],
    ['geocoding', 'Error while geocoding a location'],
    [
      'manifest',
      'You need to add `ACCESS_FINE_LOCATION` to the AndroidManifest',
    ],
    ['bug', "Cannot read property 'coords' of null"],
  ])('still reports %s', (_, message) => {
    expect(isExpectedLocationError(new Error(message))).toBe(false)
  })

  it('ignores non-errors', () => {
    expect(isExpectedLocationError(undefined)).toBe(false)
    expect(isExpectedLocationError({ message: 42 })).toBe(false)
  })
})
