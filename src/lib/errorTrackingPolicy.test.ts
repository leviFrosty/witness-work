import { describe, expect, it } from 'vitest'
import {
  isStorageFullError,
  shouldIgnoreError,
  shouldIgnoreExceptionProperties,
} from '@/lib/errorTrackingPolicy'
import { PurchasesError, toPurchasesError } from '@/lib/purchasesError'

// RevenueCat rejects with plain objects. iOS sets the readable code at the top
// level and in `userInfo`; Android only in `userInfo`.
const iosRevenueCat = (code: string, readable: string, message: string) => ({
  code,
  message,
  readableErrorCode: readable,
  userInfo: { readableErrorCode: readable },
  underlyingErrorMessage: '',
})
const androidRevenueCat = (
  code: string,
  readable: string,
  message: string
) => ({
  code,
  message,
  userInfo: { readableErrorCode: readable },
  underlyingErrorMessage: '',
})

const STORE_STATES = [
  [
    '3',
    'PURCHASE_NOT_ALLOWED_ERROR',
    'The device or user is not allowed to make the purchase.',
  ],
  ['2', 'STORE_PROBLEM_ERROR', 'There was a problem with the store.'],
  [
    '5',
    'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR',
    'The product is not available for purchase.',
  ],
] as const

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

describe('RevenueCat store states', () => {
  describe.each([
    ['iOS', iosRevenueCat],
    ['Android', androidRevenueCat],
  ])('%s', (_, revenueCat) => {
    it.each(STORE_STATES)(
      'ignores code %s from a background read',
      (code, readable, message) => {
        const error = toPurchasesError(revenueCat(code, readable, message), {
          background: true,
        })
        expect(shouldIgnoreError(error)).toBe(true)
      }
    )

    it.each(STORE_STATES)(
      'reports code %s from a purchase',
      (code, readable, message) => {
        const raw = revenueCat(code, readable, message)
        expect(shouldIgnoreError(raw)).toBe(false)
        expect(shouldIgnoreError(toPurchasesError(raw))).toBe(false)
      }
    )

    it('reports other codes from a background read', () => {
      const error = toPurchasesError(
        revenueCat('16', 'UNKNOWN_BACKEND_ERROR', 'Unknown backend error.'),
        { background: true }
      )
      expect(shouldIgnoreError(error)).toBe(false)
    })

    it('still ignores being offline once wrapped', () => {
      const error = toPurchasesError(
        revenueCat('10', 'NETWORK_ERROR', 'Error performing request.')
      )
      expect(shouldIgnoreError(error)).toBe(true)
    })
  })
})

describe('toPurchasesError', () => {
  it.each([
    ['iOS', iosRevenueCat],
    ['Android', androidRevenueCat],
  ])('names a %s error after its code', (_, revenueCat) => {
    const error = toPurchasesError(
      revenueCat('3', 'PURCHASE_NOT_ALLOWED_ERROR', 'Not allowed.')
    )
    expect(error).toBeInstanceOf(PurchasesError)
    expect(error).toMatchObject({
      name: 'PurchasesError:PURCHASE_NOT_ALLOWED_ERROR',
      message: 'Not allowed.',
      code: '3',
      background: false,
    })
  })

  it('keeps the stack of a bridged Error', () => {
    const bridged = Object.assign(new Error('There was a problem.'), {
      code: '2',
      userInfo: { readableErrorCode: 'STORE_PROBLEM_ERROR' },
    })
    const error = toPurchasesError(bridged) as PurchasesError
    expect(error.name).toBe('PurchasesError:STORE_PROBLEM_ERROR')
    expect(error.stack).toBe(bridged.stack)
  })

  it('leaves a wrapped error as it is', () => {
    const error = toPurchasesError(
      androidRevenueCat('2', 'STORE_PROBLEM_ERROR', 'Store problem.'),
      { background: true }
    )
    expect(toPurchasesError(error)).toBe(error)
  })

  it.each([
    ['a bug', new TypeError('x is not a function')],
    ['a coded non-RevenueCat error', { code: 'ENOSPC', message: 'write' }],
    ['a string', 'boom'],
    ['null', null],
  ])('leaves %s unchanged', (_, error) => {
    expect(toPurchasesError(error, { background: true })).toBe(error)
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

  // `request()` rejects with an `HttpError` whose message is its kind; one
  // nobody caught arrives with only that message.
  it.each(['timeout', 'offline', 'cancelled'])(
    'drops an uncaught HttpError: %s',
    (value) => {
      expect(
        shouldIgnoreExceptionProperties({
          $exception_list: [{ type: 'HttpError', value }],
        })
      ).toBe(true)
    }
  )

  it.each(['server: internal', 'client: invalid_request', 'invalid JSON'])(
    'keeps an uncaught HttpError: %s',
    (value) => {
      expect(
        shouldIgnoreExceptionProperties({
          $exception_list: [{ type: 'HttpError', value }],
        })
      ).toBe(false)
    }
  )

  it('keeps other exceptions', () => {
    expect(
      shouldIgnoreExceptionProperties({
        $exception_list: [{ type: 'TypeError', value: 'x is not a function' }],
      })
    ).toBe(false)
    expect(
      shouldIgnoreExceptionProperties({
        $exception_list: [{ type: 'Error', value: 'timeout' }],
      })
    ).toBe(false)
    expect(shouldIgnoreExceptionProperties({})).toBe(false)
  })
})
