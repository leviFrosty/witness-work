import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CodedError, toCodedError } from '@/lib/codedError'
import { shouldIgnoreError } from '@/lib/errorTrackingPolicy'

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  capture: vi.fn(),
}))

vi.mock('@/lib/posthogClient', () => ({
  posthogClient: { captureException: mocks.captureException },
}))
vi.mock('@/lib/analytics', () => ({
  analytics: { capture: mocks.capture },
}))

const { errorTracking } = await import('@/lib/errorTracking')

/** What a rejected native module call looks like in JavaScript. */
const nativeRejection = (code: string, message: string) =>
  Object.assign(new Error(message), { code })

describe('toCodedError', () => {
  it('names a native module failure after its code', () => {
    const raw = nativeRejection(
      'ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE',
      'Failed to schedule notification'
    )
    const error = toCodedError(raw)
    expect(error).toBeInstanceOf(CodedError)
    expect(error).toMatchObject({
      name: 'ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE',
      code: 'ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE',
      message: 'Failed to schedule notification',
      stack: raw.stack,
    })
  })

  it('names a module’s own E_ code too', () => {
    expect(
      toCodedError(nativeRejection('E_LOCATION_UNAVAILABLE', 'No fix'))
    ).toMatchObject({ name: 'E_LOCATION_UNAVAILABLE' })
  })

  it('leaves a wrapped error as it is', () => {
    const error = toCodedError(nativeRejection('ERR_SQLITE_ERROR', 'x'))
    expect(toCodedError(error)).toBe(error)
  })

  it.each([
    ['a named error', Object.assign(new TypeError('x'), { code: 'ERR_X' })],
    ['a RevenueCat code', nativeRejection('2', 'There was a problem.')],
    ['a POSIX code', nativeRejection('ENOSPC', 'write failed')],
    ['an error without a code', new Error('boom')],
    ['a plain object', { code: 'ERR_X', message: 'x' }],
    ['a string', 'boom'],
    ['null', null],
  ])('leaves %s unchanged', (_, error) => {
    expect(toCodedError(error)).toBe(error)
  })

  it('still filters an expected state once wrapped', () => {
    const error = toCodedError(
      nativeRejection(
        'ERR_UNEXPECTED',
        'You can’t save the file “snapshot.json” because the volume “User” is out of space.'
      )
    )
    expect(error).toBeInstanceOf(CodedError)
    expect(shouldIgnoreError(error)).toBe(true)
  })
})

describe('errorTracking.captureException', () => {
  beforeEach(() => {
    mocks.captureException.mockClear()
    mocks.capture.mockClear()
  })

  it('reports each native failure under its own code', () => {
    errorTracking.captureException(
      nativeRejection('ERR_SQLITE_ERROR', 'Error code 26: file is not a db')
    )
    errorTracking.captureException(
      nativeRejection('ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE', 'Failed')
    )
    expect(
      mocks.captureException.mock.calls.map(([error]) => error.name)
    ).toEqual(['ERR_SQLITE_ERROR', 'ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE'])
  })

  it('reports other errors as they are', () => {
    const error = new TypeError('x is not a function')
    errorTracking.captureException(error)
    expect(mocks.captureException).toHaveBeenCalledWith(error, undefined)
  })
})
