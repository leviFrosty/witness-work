import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyICloudError,
  toICloudTransportError,
} from '@/lib/syncTransport/iCloudErrors'
import { withTransportTimeout } from '@/lib/syncTransport/timeout'
import {
  SyncTransportError,
  syncTransportErrorCode,
} from '@/lib/syncTransport/types'

const coded = (code: string, message: string) =>
  Object.assign(new Error(message), { code })

describe('classifyICloudError', () => {
  it('treats a signed-out container as unauthorized', () => {
    expect(
      classifyICloudError(
        new Error(
          'iCloud is unavailable. Verify the user is signed in and the app has iCloud entitlements.'
        )
      )
    ).toBe('unauthorized')
  })

  it('treats coordinated I/O failures as the service being unavailable', () => {
    expect(
      classifyICloudError(coded('ICLOUD_COORDINATE', 'Coordinator error: x'))
    ).toBe('network')
    expect(classifyICloudError(coded('ICLOUD_WRITE', 'Failed: x'))).toBe(
      'network'
    )
  })

  it('leaves bugs and missing local files unknown', () => {
    expect(
      classifyICloudError(coded('ICLOUD_FILENAME', 'Refusing to write'))
    ).toBe('unknown')
    expect(
      classifyICloudError(
        coded('ICLOUD_WRITE_BINARY', 'Source file does not exist: /a.jpg')
      )
    ).toBe('unknown')
    expect(classifyICloudError(new Error('boom'))).toBe('unknown')
  })

  it('wraps rejections as SyncTransportError', () => {
    const error = toICloudTransportError(coded('ICLOUD_DELETE', 'Failed'))
    expect(error).toBeInstanceOf(SyncTransportError)
    expect(syncTransportErrorCode(error)).toBe('network')
  })
})

describe('withTransportTimeout', () => {
  afterEach(() => vi.useRealTimers())

  it('fails a call that never settles with a network error', async () => {
    vi.useFakeTimers()
    const result = withTransportTimeout('write', new Promise(() => {}), 1000)
    const caught = result.catch((e) => e)
    await vi.advanceTimersByTimeAsync(1000)
    expect(syncTransportErrorCode(await caught)).toBe('network')
  })

  it('passes through a call that settles in time', async () => {
    await expect(
      withTransportTimeout('write', Promise.resolve(3))
    ).resolves.toBe(3)
    await expect(
      withTransportTimeout('write', Promise.reject(new Error('no')))
    ).rejects.toThrow('no')
  })
})
