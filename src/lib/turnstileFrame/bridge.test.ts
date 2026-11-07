import { describe, expect, it, vi } from 'vitest'
import { createTurnstileBridge, READY_TIMEOUT_MS } from './bridge'
import {
  frameMessage,
  initMessage,
  MAX_TOKEN_LENGTH,
  TURNSTILE_FRAME_PROTOCOL,
  TURNSTILE_FRAME_VERSION,
} from './protocol'

const ORIGIN = 'https://verify-dev.witnesswork.app'

function setup() {
  const frame = { postMessage: vi.fn() }
  const timers: { run: () => void; ms: number; cleared: boolean }[] = []
  const onToken = vi.fn()
  const onError = vi.fn()
  const onReady = vi.fn()
  const onExpired = vi.fn()
  const bridge = createTurnstileBridge({
    origin: ORIGIN,
    action: 'web-recovery',
    target: () => frame,
    onToken,
    onError,
    onReady,
    onExpired,
    setTimer: (run, ms) => {
      const timer = { run, ms, cleared: false }
      timers.push(timer)
      return timer
    },
    clearTimer: (timer) => {
      ;(timer as (typeof timers)[number]).cleared = true
    },
  })
  const fromFrame = (data: unknown, overrides = {}) =>
    bridge.receive({ origin: ORIGIN, source: frame, data, ...overrides })
  return {
    bridge,
    frame,
    timers,
    onToken,
    onError,
    onReady,
    onExpired,
    fromFrame,
  }
}

const token = (value = 'abc.DEF-123_x') =>
  frameMessage('web-recovery', { type: 'token', token: value })

describe('createTurnstileBridge', () => {
  it('greets the frame at its exact origin once it loads', () => {
    const { bridge, frame } = setup()
    bridge.frameLoaded()
    expect(frame.postMessage).toHaveBeenCalledWith(initMessage(), ORIGIN)
  })

  it('passes on a token from its own frame', () => {
    const { fromFrame, onToken, onError } = setup()
    fromFrame(token())
    expect(onToken).toHaveBeenCalledWith('abc.DEF-123_x')
    expect(onError).not.toHaveBeenCalled()
  })

  it('drops a message from another origin', () => {
    const { fromFrame, onToken } = setup()
    fromFrame(token(), { origin: 'https://verify.witnesswork.app' })
    fromFrame(token(), { origin: 'https://challenges.cloudflare.com' })
    fromFrame(token(), { origin: 'https://app-dev.witnesswork.app' })
    expect(onToken).not.toHaveBeenCalled()
  })

  it('drops a message from another window, even at the frame’s origin', () => {
    const { fromFrame, onToken } = setup()
    fromFrame(token(), { source: { postMessage() {} } })
    fromFrame(token(), { source: null })
    expect(onToken).not.toHaveBeenCalled()
  })

  it('drops malformed messages', () => {
    const { fromFrame, onToken, onError } = setup()
    const good = token()
    for (const data of [
      null,
      'abc',
      42,
      [good],
      { ...good, protocol: 'ww-maps' },
      { ...good, version: TURNSTILE_FRAME_VERSION + 1 },
      { ...good, version: String(TURNSTILE_FRAME_VERSION) },
      { ...good, type: 'tokens' },
      { ...good, extra: 'x' },
      { ...good, token: 42 },
      { ...good, token: '' },
      { ...good, token: 'has space' },
      { ...good, token: 'line\nbreak' },
      {
        protocol: TURNSTILE_FRAME_PROTOCOL,
        version: TURNSTILE_FRAME_VERSION,
        type: 'token',
        token: 'abc',
      },
      { ...frameMessage('web-recovery', { type: 'expired' }), token: 'abc' },
      {
        ...frameMessage('web-recovery', { type: 'error', reason: 'check' }),
        reason: 'other',
      },
    ])
      fromFrame(data)
    expect(onToken).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('drops an oversized token', () => {
    const { fromFrame, onToken } = setup()
    fromFrame(token('a'.repeat(MAX_TOKEN_LENGTH + 1)))
    expect(onToken).not.toHaveBeenCalled()
    fromFrame(token('a'.repeat(MAX_TOKEN_LENGTH)))
    expect(onToken).toHaveBeenCalledWith('a'.repeat(MAX_TOKEN_LENGTH))
  })

  it('drops a token for another action', () => {
    const { fromFrame, onToken } = setup()
    fromFrame(frameMessage('web-signup', { type: 'token', token: 'abc' }))
    expect(onToken).not.toHaveBeenCalled()
  })

  it('says when a token expired', () => {
    const { fromFrame, onExpired, onError } = setup()
    fromFrame(token())
    fromFrame(frameMessage('web-recovery', { type: 'expired' }))
    expect(onExpired).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('clears the token when it expires, without an error', () => {
    const { fromFrame, onToken, onError } = setup()
    fromFrame(token())
    fromFrame(frameMessage('web-recovery', { type: 'expired' }))
    expect(onToken).toHaveBeenLastCalledWith(null)
    expect(onError).not.toHaveBeenCalled()
  })

  it('clears the token and reports a failed check on an error or a timeout', () => {
    const { fromFrame, onToken, onError } = setup()
    fromFrame(frameMessage('web-recovery', { type: 'error', reason: 'check' }))
    expect(onToken).toHaveBeenLastCalledWith(null)
    expect(onError).toHaveBeenLastCalledWith('check')
    fromFrame(frameMessage('web-recovery', { type: 'timeout' }))
    expect(onError).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenLastCalledWith('check')
  })

  it('reports the script when the frame couldn’t load Turnstile', () => {
    const { fromFrame, onError } = setup()
    fromFrame(frameMessage('web-recovery', { type: 'error', reason: 'script' }))
    expect(onError).toHaveBeenCalledWith('script')
  })

  it('waits about 15 s from mount for the frame’s first message', () => {
    const { timers } = setup()
    expect(timers.map((timer) => timer.ms)).toEqual([READY_TIMEOUT_MS])
    expect(READY_TIMEOUT_MS).toBeGreaterThanOrEqual(15_000)
    expect(READY_TIMEOUT_MS).toBeLessThanOrEqual(20_000)
  })

  it('doesn’t count the page’s load as the frame coming up', () => {
    const { bridge, timers, onError, onReady } = setup()
    bridge.frameLoaded()
    bridge.frameLoaded()
    expect(timers).toHaveLength(1)
    expect(timers[0]?.cleared).toBe(false)
    expect(onReady).not.toHaveBeenCalled()
    timers[0]!.run()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith('script')
  })

  it('says it’s up on the first ready or token, once', () => {
    const first = setup()
    first.fromFrame(frameMessage('web-recovery', { type: 'ready' }))
    first.fromFrame(token())
    expect(first.onReady).toHaveBeenCalledOnce()
    expect(first.timers[0]?.cleared).toBe(true)

    const second = setup()
    second.fromFrame(token())
    expect(second.onReady).toHaveBeenCalledOnce()
    expect(second.onToken).toHaveBeenCalledWith('abc.DEF-123_x')
    second.timers[0]!.run()
    expect(second.onError).not.toHaveBeenCalled()
  })

  it('stops waiting on any message from the frame', () => {
    for (const type of ['timeout', 'expired'] as const) {
      const { fromFrame, timers, onError } = setup()
      fromFrame(frameMessage('web-recovery', { type }))
      expect(timers[0]?.cleared).toBe(true)
      timers[0]!.run()
      expect(onError).not.toHaveBeenCalledWith('script')
    }
  })

  it('stops waiting on an error, which says why itself', () => {
    const { fromFrame, timers, onError, onReady } = setup()
    fromFrame(frameMessage('web-recovery', { type: 'error', reason: 'check' }))
    expect(timers[0]?.cleared).toBe(true)
    expect(onReady).not.toHaveBeenCalled()
    timers[0]!.run()
    expect(onError).toHaveBeenCalledOnce()
  })

  it('hears nothing once disposed', () => {
    const { bridge, fromFrame, timers, onToken } = setup()
    bridge.frameLoaded()
    bridge.dispose()
    expect(timers.every((timer) => timer.cleared)).toBe(true)
    fromFrame(token())
    expect(onToken).not.toHaveBeenCalled()
  })
})
