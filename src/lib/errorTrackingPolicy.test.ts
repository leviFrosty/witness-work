import { describe, expect, it } from 'vitest'
import {
  isStorageFullError,
  shouldIgnoreError,
  shouldIgnoreExceptionProperties,
} from '@/lib/errorTrackingPolicy'

describe('isStorageFullError', () => {
  it.each([
    [
      'iOS volume',
      'You can’t save the file “snapshot.json” because the volume “User” is out of space.',
    ],
    [
      'iOS Cocoa code',
      'Error Domain=NSCocoaErrorDomain Code=640 "(null)" UserInfo={NSFilePath=/x}',
    ],
    ['ENOSPC message', 'ENOSPC: no space left on device, write'],
    ['POSIX', 'write failed: No space left on device'],
  ])('%s', (_, message) => {
    expect(isStorageFullError(new Error(message))).toBe(true)
    expect(isStorageFullError(message)).toBe(true)
  })

  it('reads an ENOSPC code', () => {
    expect(isStorageFullError({ code: 'ENOSPC', message: 'write' })).toBe(true)
  })

  it.each([
    ['MMKV write failure', 'Failed to set reminderSchedule!'],
    ['MMKV read-only', 'Failed to set theme! This instance is read-only!'],
    ['iCloud quota wording', 'There isn’t enough space to save the file.'],
    ['other Cocoa code', 'Error Domain=NSCocoaErrorDomain Code=6400'],
    ['other Cocoa code', 'Error Domain=NSCocoaErrorDomain Code=4 "(null)"'],
    ['bug', "Cannot read property 'space' of undefined"],
    ['set failure', 'Failed to set up notifications'],
  ])('still reports %s', (_, message) => {
    expect(isStorageFullError(new Error(message))).toBe(false)
  })

  it('ignores non-errors', () => {
    expect(isStorageFullError(undefined)).toBe(false)
    expect(isStorageFullError(null)).toBe(false)
    expect(isStorageFullError({ code: 640 })).toBe(false)
  })
})

describe('shouldIgnoreError', () => {
  it.each([
    [
      'RevenueCat network error on Android',
      Object.assign(new Error('Error performing request.'), {
        code: '10',
        userInfo: { readableErrorCode: 'NETWORK_ERROR' },
      }),
    ],
    [
      'Android location off',
      new Error(
        'Current location is unavailable. Make sure that location services are enabled'
      ),
    ],
    [
      'Android location settings',
      new Error('Location request failed due to unsatisfied device settings'),
    ],
    [
      'iOS location denied',
      new Error(
        'The operation couldn’t be completed. (kCLErrorDomain error 1.)'
      ),
    ],
    [
      'storage full',
      new Error(
        'Error Domain=NSCocoaErrorDomain Code=640 "The volume “User” is out of space."'
      ),
    ],
  ])('ignores %s', (_, error) => {
    expect(shouldIgnoreError(error)).toBe(true)
  })

  it.each([
    ['a bug', new TypeError("Cannot read property 'x' of undefined")],
    [
      'a non-RevenueCat code 10',
      Object.assign(new Error('Something broke'), { code: '10' }),
    ],
    ['an MMKV write failure', new Error('Failed to set reminderSchedule!')],
    [
      'a RevenueCat store problem',
      Object.assign(new Error('There was a problem with the store.'), {
        code: '2',
        userInfo: { readableErrorCode: 'STORE_PROBLEM_ERROR' },
      }),
    ],
  ])('reports %s', (_, error) => {
    expect(shouldIgnoreError(error)).toBe(false)
  })
})

describe('shouldIgnoreExceptionProperties', () => {
  it.each([
    'Error performing request.',
    'Location request failed due to unsatisfied device settings',
    'The volume “User” is out of space.',
  ])('drops an automatic exception: %s', (value) => {
    expect(
      shouldIgnoreExceptionProperties({
        $exception_list: [{ type: 'Error', value }],
      })
    ).toBe(true)
  })

  it('keeps other exceptions', () => {
    expect(
      shouldIgnoreExceptionProperties({
        $exception_list: [{ type: 'TypeError', value: 'x is not a function' }],
      })
    ).toBe(false)
    expect(shouldIgnoreExceptionProperties({})).toBe(false)
  })
})
