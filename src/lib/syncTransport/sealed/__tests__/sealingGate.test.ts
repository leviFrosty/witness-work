import { describe, expect, it } from 'vitest'
import {
  decideSealing,
  type FolderView,
  type ObservedSnapshot,
  SEALING_QUIET_DEVICE_MS,
  SEALING_READ_MAX_AGE_MS,
} from '@/lib/syncTransport/sealed/sealingGate'

const NOW = 1_000_000_000_000
const snapshot = (over: Partial<ObservedSnapshot>): ObservedSnapshot => ({
  filename: 'witness-work-b.json',
  modifiedAt: NOW - 60_000,
  sealedKey: null,
  advert: { key: 'K' },
  hasPlain: true,
  ...over,
})
const view = (
  snapshots: ObservedSnapshot[],
  over: Partial<FolderView> = {}
): FolderView => ({
  readAt: NOW - 1_000,
  complete: true,
  snapshots,
  ownSealed: false,
  ...over,
})
const decide = (
  v: FolderView | null,
  over: Partial<Parameters<typeof decideSealing>[0]> = {}
) =>
  decideSealing({
    view: v,
    remembered: false,
    ownKey: 'K',
    switchOn: true,
    now: NOW,
    ...over,
  })

describe('decideSealing', () => {
  it('starts when every recent device advertises this key', () => {
    expect(decide(view([snapshot({})]))).toEqual({ mode: 'start' })
    expect(decide(view([]))).toEqual({ mode: 'start' })
  })

  it('waits for an old build, a device without a key, or another account', () => {
    const decision = decide(
      view([
        snapshot({ filename: 'witness-work-old.json', advert: null }),
        snapshot({ filename: 'witness-work-new.json', advert: { key: null } }),
        snapshot({ filename: 'witness-work-other.json', advert: { key: 'X' } }),
      ])
    )
    expect(decision).toEqual({
      mode: 'plain',
      waitingFor: 'devices',
      holdups: [
        { filename: 'witness-work-old.json', reason: 'update' },
        { filename: 'witness-work-new.json', reason: 'no-key' },
        { filename: 'witness-work-other.json', reason: 'other-account' },
      ],
    })
  })

  it('lets devices quiet for 30 days not hold it', () => {
    const quiet = snapshot({
      advert: null,
      modifiedAt: NOW - SEALING_QUIET_DEVICE_MS,
    })
    expect(decide(view([quiet]))).toEqual({ mode: 'start' })
    expect(
      decide(view([{ ...quiet, modifiedAt: quiet.modifiedAt + 60_000 }])).mode
    ).toBe('plain')
  })

  it('needs the switch, a key, and a fresh complete read', () => {
    const v = view([snapshot({})])
    expect(decide(v, { switchOn: false })).toMatchObject({
      waitingFor: 'switch',
    })
    expect(decide(v, { ownKey: null })).toMatchObject({ waitingFor: 'key' })
    expect(decide(null)).toMatchObject({ waitingFor: 'read' })
    expect(decide(view([snapshot({})], { complete: false }))).toMatchObject({
      waitingFor: 'read',
    })
    expect(
      decide(
        view([snapshot({})], { readAt: NOW - SEALING_READ_MAX_AGE_MS - 1 })
      )
    ).toMatchObject({ waitingFor: 'read' })
  })

  it('stays sealed once the folder is, whatever the switch or key says', () => {
    expect(
      decide(view([snapshot({ sealedKey: 'X', advert: null })]), {
        switchOn: false,
        ownKey: null,
      })
    ).toEqual({ mode: 'sealed' })
    expect(decide(view([], { ownSealed: true }))).toEqual({ mode: 'sealed' })
    expect(decide(null, { remembered: true, switchOn: false })).toEqual({
      mode: 'sealed',
    })
  })
})
