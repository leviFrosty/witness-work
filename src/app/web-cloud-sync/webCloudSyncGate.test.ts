import { describe, expect, it } from 'vitest'
import {
  CLOUD_SYNC_REQUEST_MIN_APP_VERSION,
  PHONE_SLOT_FRESH_MS,
  decideWebCloudSync,
  type WebCloudSyncInput,
} from '@/app/web-cloud-sync/webCloudSyncGate'

// What the web shows after signing in (ADR 0040 §5; docs/cloud-sync-photos.md,
// "The web").

const NOW = 1_800_000_000_000
const BROWSER = 'slot-browser1'

/** A slot a live phone session wrote a minute ago, unless told otherwise. */
const slot = (
  slotId: string,
  overrides: Partial<{
    platform: 'ios' | 'android' | 'dev' | 'web' | null
    live: boolean
    updatedAt: number
  }> = {}
) => ({
  slotId,
  platform: 'ios' as const,
  live: true,
  updatedAt: NOW - 60_000,
  ...overrides,
})
const phone = (
  platform: 'ios' | 'android' | 'dev',
  appVersion: string | null = null
) => ({ platform, appVersion })
const browser = { platform: 'web', appVersion: null }

const input = (overrides: Partial<WebCloudSyncInput> = {}) => ({
  slots: [],
  ownSlotId: BROWSER,
  sessions: [phone('ios'), browser],
  requestedAt: null,
  now: NOW,
  ...overrides,
})

const older = '1.0.0'

describe('decideWebCloudSync', () => {
  it('goes on once a live phone session wrote a slot', () => {
    for (const platform of ['ios', 'android', 'dev'] as const)
      expect(
        decideWebCloudSync(
          input({ slots: [slot('slot-phone001', { platform })] })
        )
      ).toBe('ready')
    // Whatever the request or the phones' versions say.
    expect(
      decideWebCloudSync(
        input({
          slots: [slot(BROWSER, { platform: 'web' }), slot('slot-phone001')],
          sessions: [phone('android', older)],
          requestedAt: NOW - 1_000,
        })
      )
    ).toBe('ready')
  })

  it('ignores this browser’s own slot and other browsers’', () => {
    expect(
      decideWebCloudSync(input({ slots: [slot(BROWSER, { platform: 'ios' })] }))
    ).toBe('turnOn')
    expect(
      decideWebCloudSync(
        input({ slots: [slot('slot-browser2', { platform: 'web' })] })
      )
    ).toBe('turnOn')
  })

  it('ignores a slot whose session ended, or of no known platform', () => {
    expect(
      decideWebCloudSync(
        input({ slots: [slot('slot-phone001', { live: false })] })
      )
    ).toBe('turnOn')
    expect(
      decideWebCloudSync(
        input({ slots: [slot('slot-phone001', { platform: null })] })
      )
    ).toBe('turnOn')
  })

  it('ignores a stale slot, written more than 30 days ago', () => {
    expect(
      decideWebCloudSync(
        input({
          slots: [
            slot('slot-phone001', { updatedAt: NOW - PHONE_SLOT_FRESH_MS }),
          ],
        })
      )
    ).toBe('turnOn')
    expect(
      decideWebCloudSync(
        input({
          slots: [
            slot('slot-phone001', { updatedAt: NOW - PHONE_SLOT_FRESH_MS + 1 }),
          ],
        })
      )
    ).toBe('ready')
  })

  it('goes on for an account with no phones: the web seeds Cloud Sync', () => {
    expect(decideWebCloudSync(input({ sessions: [] }))).toBe('ready')
    expect(decideWebCloudSync(input({ sessions: [browser, browser] }))).toBe(
      'ready'
    )
  })

  it('asks to turn Cloud Sync on until a request stands', () => {
    expect(decideWebCloudSync(input())).toBe('turnOn')
    expect(
      decideWebCloudSync(input({ sessions: [phone('android', older)] }))
    ).toBe('turnOn')
  })

  it('waits for the phone once asked', () => {
    expect(decideWebCloudSync(input({ requestedAt: NOW - 60_000 }))).toBe(
      'waiting'
    )
  })

  it('trusts ww-api on whether the request still stands', () => {
    // Asking again restarts its 30 days without changing its time.
    expect(
      decideWebCloudSync(input({ requestedAt: NOW - 45 * 24 * 60 * 60 * 1000 }))
    ).toBe('waiting')
  })

  it('asks to update the phone when every phone is too old to read the request', () => {
    expect(
      decideWebCloudSync(
        input({
          requestedAt: NOW,
          sessions: [phone('ios', older), phone('android', '1.2.3'), browser],
        })
      )
    ).toBe('updatePhone')
  })

  it('waits when any phone is new enough', () => {
    expect(
      decideWebCloudSync(
        input({
          requestedAt: NOW,
          sessions: [
            phone('ios', older),
            phone('android', CLOUD_SYNC_REQUEST_MIN_APP_VERSION),
          ],
        })
      )
    ).toBe('waiting')
  })

  it('waits when a phone’s version isn’t known', () => {
    expect(
      decideWebCloudSync(
        input({
          requestedAt: NOW,
          sessions: [phone('ios', older), phone('ios')],
        })
      )
    ).toBe('waiting')
    expect(
      decideWebCloudSync(
        input({ requestedAt: NOW, sessions: [phone('ios', 'not-a-version')] })
      )
    ).toBe('waiting')
  })

  it('doesn’t wait for a session of a platform it doesn’t know', () => {
    const unknown = { platform: null, appVersion: null }
    expect(decideWebCloudSync(input({ sessions: [unknown, browser] }))).toBe(
      'ready'
    )
    expect(
      decideWebCloudSync(
        input({ requestedAt: NOW, sessions: [unknown, phone('ios', older)] })
      )
    ).toBe('updatePhone')
  })

  it('counts a development build’s session as a phone', () => {
    expect(decideWebCloudSync(input({ sessions: [phone('dev')] }))).toBe(
      'turnOn'
    )
  })
})
