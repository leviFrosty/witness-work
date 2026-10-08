import { describe, expect, it } from 'vitest'
import {
  classifyNetworkError,
  isConnectivityError,
  isRetryableNetworkError,
} from '@/lib/http/networkError'
import { isOfflineError } from '@/lib/offlineError'

describe('classifyNetworkError', () => {
  it.each([
    [
      'iOS offline',
      new Error('The Internet connection appears to be offline.'),
    ],
    ['RN fetch', new TypeError('Network request failed')],
    [
      'axios',
      Object.assign(new Error('Network Error'), {
        code: 'ERR_NETWORK',
        isAxiosError: true,
      }),
    ],
    [
      'OkHttp DNS',
      new Error(
        'Unable to resolve host "api.example.com": No address associated with hostname'
      ),
    ],
    ['OkHttp connect', new Error('failed to connect to /10.0.0.1 (port 443)')],
    ['relay', Object.assign(new Error('network'), { code: 'network' })],
    [
      'RevenueCat',
      {
        code: '10',
        readableErrorCode: 'NETWORK_ERROR',
        message: 'Error performing request.',
      },
    ],
    [
      'RevenueCat offline',
      {
        code: '35',
        readableErrorCode: 'OFFLINE_CONNECTION_ERROR',
        message: 'x',
      },
    ],
    [
      'axios without response',
      { isAxiosError: true, response: undefined, message: 'boom' },
    ],
  ])('%s is offline', (_, error) => {
    expect(classifyNetworkError(error)).toBe('offline')
  })

  it.each([
    ['iOS', new Error('The request timed out.')],
    [
      'axios',
      Object.assign(new Error('timeout of 8000ms exceeded'), {
        code: 'ECONNABORTED',
      }),
    ],
    ['Android', new Error('java.net.SocketTimeoutException: timeout')],
    ['408', { status: 408 }],
  ])('%s is a timeout', (_, error) => {
    expect(classifyNetworkError(error)).toBe('timeout')
  })

  it('reads statuses from axios responses and plain errors', () => {
    expect(classifyNetworkError({ response: { status: 429 } })).toBe(
      'rateLimited'
    )
    expect(classifyNetworkError({ response: { status: 503 } })).toBe('server')
    expect(classifyNetworkError({ status: 404 })).toBe('client')
  })

  it('treats aborts as cancellations', () => {
    expect(classifyNetworkError({ name: 'AbortError' })).toBe('cancelled')
    expect(
      classifyNetworkError({ name: 'CanceledError', code: 'ERR_CANCELED' })
    ).toBe('cancelled')
  })

  it('leaves bugs alone', () => {
    expect(
      classifyNetworkError(
        new TypeError("Cannot read property 'x' of undefined")
      )
    ).toBe('unknown')
    expect(classifyNetworkError({ code: 'constructor' })).toBe('unknown')
    expect(
      classifyNetworkError({ code: '10', message: 'no RevenueCat marker' })
    ).toBe('unknown')
    expect(classifyNetworkError(undefined)).toBe('unknown')
  })

  it('separates connectivity from retryable failures', () => {
    expect(isConnectivityError({ name: 'AbortError' })).toBe(true)
    expect(isRetryableNetworkError({ name: 'AbortError' })).toBe(false)
    expect(isRetryableNetworkError({ status: 503 })).toBe(true)
    expect(isRetryableNetworkError({ status: 400 })).toBe(false)
    expect(isOfflineError(new TypeError('Network request failed'))).toBe(true)
  })
})
