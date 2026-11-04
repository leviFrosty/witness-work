import { describe, expect, it } from 'vitest'
import {
  frameUrl,
  initMessage,
  isInitMessage,
  parseFrameParams,
  TURNSTILE_FRAME_PROTOCOL,
  TURNSTILE_FRAME_VERSION,
} from './protocol'

describe('the frame URL', () => {
  it('carries the site key and the action, and nothing else', () => {
    const url = new URL(
      frameUrl('https://verify-dev.witnesswork.app', {
        siteKey: '0x4AAAAAAAabc_-1',
        action: 'web-signup',
      })
    )
    expect(url.origin).toBe('https://verify-dev.witnesswork.app')
    expect(url.pathname).toBe('/')
    expect([...url.searchParams.keys()]).toEqual(['sitekey', 'action'])
    expect(parseFrameParams(url.search)).toEqual({
      siteKey: '0x4AAAAAAAabc_-1',
      action: 'web-signup',
    })
  })

  it('reads as nothing with a missing or odd site key or action', () => {
    for (const search of [
      '',
      '?sitekey=1x00000000000000000000AA',
      '?action=web-recovery',
      '?sitekey=1x00000000000000000000AA&action=web-login',
      '?sitekey=%3Cscript%3E&action=web-recovery',
      `?sitekey=${'a'.repeat(65)}&action=web-recovery`,
    ])
      expect(parseFrameParams(search)).toBeNull()
  })
})

describe('the app’s init', () => {
  it('is exactly the envelope and its type', () => {
    expect(isInitMessage(initMessage())).toBe(true)
    for (const data of [
      null,
      { ...initMessage(), extra: 1 },
      { ...initMessage(), version: TURNSTILE_FRAME_VERSION + 1 },
      { ...initMessage(), protocol: 'ww-maps' },
      { protocol: TURNSTILE_FRAME_PROTOCOL, type: 'init' },
      { ...initMessage(), type: 'token' },
    ])
      expect(isInitMessage(data)).toBe(false)
  })
})
