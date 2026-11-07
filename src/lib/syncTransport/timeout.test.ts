import { afterEach, describe, expect, it, vi } from 'vitest'
import { withTransferTimeout } from '@/lib/syncTransport/timeout'

afterEach(() => vi.useRealTimers())

const later = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('withTransferTimeout', () => {
  it('waits for the transfer from its start, not from the call', async () => {
    vi.useFakeTimers()
    const done = withTransferTimeout(
      'photo upload',
      async (phases) => {
        await later(250)
        phases.start()
        await later(80)
        phases.end()
        return 'stored'
      },
      100,
      1_000
    )
    await vi.advanceTimersByTimeAsync(400)
    await expect(done).resolves.toBe('stored')
  })

  it('gives up on a transfer that outlasts its wait, as a network failure', async () => {
    vi.useFakeTimers()
    const done = withTransferTimeout(
      'photo upload',
      async (phases) => {
        phases.start()
        await later(150)
        return 'stored'
      },
      100,
      1_000
    ).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(200)
    expect(await done).toMatchObject({
      code: 'network',
      message: 'photo upload timed out',
    })
  })

  it('bounds the work around the transfer by the setup wait', async () => {
    vi.useFakeTimers()
    const before = withTransferTimeout(
      'photo upload',
      async () => later(5_000),
      100,
      1_000
    ).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(1_100)
    expect(await before).toMatchObject({ code: 'network' })

    const after = withTransferTimeout(
      'photo download',
      async (phases) => {
        phases.start()
        phases.end()
        await later(5_000)
      },
      100,
      1_000
    ).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(1_100)
    expect(await after).toMatchObject({ code: 'network' })
  })

  it('waits the one wait for a transport that never reports its transfer', async () => {
    vi.useFakeTimers()
    const done = withTransferTimeout(
      'photo upload',
      async () => later(500),
      100
    ).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(150)
    expect(await done).toMatchObject({ code: 'network' })
  })

  it('ignores a transport that reports its transfer after the wait has ended', async () => {
    vi.useFakeTimers()
    let phases: Parameters<Parameters<typeof withTransferTimeout>[1]>[0]
    const done = withTransferTimeout(
      'photo upload',
      (given) => {
        phases = given
        return new Promise<void>(() => {})
      },
      100
    ).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(150)
    expect(await done).toMatchObject({ code: 'network' })

    phases!.start()
    phases!.end()
    expect(vi.getTimerCount()).toBe(0)
  })
})
