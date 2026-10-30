import { describe, expect, it, vi } from 'vitest'
import {
  activityDetail,
  activityRows,
  activityTitle,
  deviceKind,
  deviceTitle,
  isSuspiciousActivity,
} from '@/features/settings/components/account/activity/activityCopy'
import type { ActivityEntry } from '@/lib/serverAccount/activityClient'
import type { DeviceLabel } from '@/lib/serverAccount/deviceLabel'

/** How Account Activity names devices and describes each entry (ADR 0028). */

// The en-US strings themselves, without the app's i18n setup (React Native).
vi.mock('@/lib/locales', async () => {
  const en = (await import('@/locales/en-US.json'))
    .default as unknown as Record<string, string>
  return {
    default: {
      t: (key: string, params: Record<string, string> = {}) =>
        en[key].replace(/%\{(\w+)\}/g, (_, name: string) => params[name]),
    },
  }
})

const labels: Record<string, DeviceLabel> = {
  pixel: { name: 'Pixel 9', platform: 'android', model: 'Pixel 9' },
  iphone: { name: 'iPhone 17', platform: 'ios', model: 'iPhone 17' },
  ipad: { name: 'Ana’s iPad', platform: 'ios', model: 'iPad Air 11-inch (M3)' },
  ipadUnnamed: { name: 'iPad', platform: 'ios', model: '' },
  pixelTablet: {
    name: 'Pixel Tablet',
    platform: 'android',
    model: 'Pixel Tablet',
  },
  iphoneNamedIpad: { name: 'iPad', platform: 'ios', model: 'iPhone 17' },
  chrome: { name: 'Chrome on macOS', platform: 'web', model: '' },
}
const context = {
  isThisDevice: (sessionId: string) =>
    sessionId === 'me' || sessionId === 'me-before',
  readLabel: (sealed: string | null) =>
    sealed ? (labels[sealed] ?? null) : null,
}

const entry = (overrides: Partial<ActivityEntry>): ActivityEntry => ({
  id: '1',
  kind: 'account.created',
  createdAt: 0,
  session: null,
  actor: null,
  slotId: null,
  method: null,
  ...overrides,
})

describe('activityTitle', () => {
  it('names this device, a labelled device, or the platform', () => {
    const opened = (
      sessionId: string,
      device: string | null,
      platform: 'ios' | 'android' | null
    ) =>
      activityTitle(
        entry({
          kind: 'session.opened',
          session: { sessionId, platform, device },
        }),
        context
      )
    expect(opened('me', 'iphone', 'ios')).toBe('Signed in on this device')
    // This device's session before it signed in again.
    expect(opened('me-before', 'iphone', 'ios')).toBe(
      'Signed in on this device'
    )
    expect(opened('x', 'pixel', 'android')).toBe('Signed in on Pixel 9')
    expect(opened('x', 'unreadable', 'ios')).toBe(
      'Signed in on an iPhone or iPad'
    )
    expect(opened('x', null, 'android')).toBe('Signed in on an Android device')
    expect(opened('x', null, null)).toBe('Signed in on a device')
  })

  it('names who signed a device out', () => {
    expect(
      activityTitle(
        entry({
          kind: 'session.revoked',
          session: { sessionId: 'x', platform: 'android', device: 'pixel' },
          actor: { sessionId: 'me', platform: 'ios', device: 'iphone' },
        }),
        context
      )
    ).toBe('Signed out Pixel 9 from this device')
    expect(
      activityTitle(
        entry({
          kind: 'session.replaced',
          session: { sessionId: 'x', platform: 'android', device: null },
          actor: { sessionId: 'y', platform: 'ios', device: 'iphone' },
        }),
        context
      )
    ).toBe('Signed out an Android device when iPhone 17 signed in')
  })

  it('tells one backup from all of them, and works without a session', () => {
    const session = { sessionId: 'me', platform: 'ios' as const, device: null }
    expect(
      activityTitle(
        entry({ kind: 'backup.deleted', session, slotId: 'slot' }),
        context
      )
    ).toBe('Backup deleted on this device')
    expect(
      activityTitle(entry({ kind: 'backup.deleted', session }), context)
    ).toBe('All backups deleted on this device')
    expect(activityTitle(entry({ kind: 'backup.deleted' }), context)).toBe(
      'All backups were deleted'
    )
    expect(
      activityTitle(entry({ kind: 'buddies.deleted', session }), context)
    ).toBe('Buddies data deleted on this device')
    expect(
      activityTitle(entry({ kind: 'buddies.inbox_linked' }), context)
    ).toBe('Buddies set up')
    expect(activityTitle(entry({ kind: 'handoff.sent' }), context)).toBe(
      'Account sent to a new phone'
    )
  })

  it('flags a reused refresh token and explains it', () => {
    const reused = entry({
      kind: 'session.refresh_reused',
      session: { sessionId: 'x', platform: 'android', device: 'pixel' },
    })
    expect(isSuspiciousActivity(reused)).toBe(true)
    expect(activityTitle(reused, context)).toBe(
      'Signed out Pixel 9 to protect your account'
    )
    expect(activityDetail(reused)).toMatch(/copied/)
    expect(isSuspiciousActivity(entry({ kind: 'session.revoked' }))).toBe(false)
  })
})

describe('browsers', () => {
  const chrome = { sessionId: 'w', platform: 'web' as const, device: 'chrome' }
  const bareBrowser = { ...chrome, device: null }
  const iphone = { sessionId: 'p', platform: 'ios' as const, device: 'iphone' }
  const opened = (
    method: ActivityEntry['method'],
    session: ActivityEntry['session'] = chrome,
    actor: ActivityEntry['actor'] = null
  ) =>
    activityTitle(
      entry({ kind: 'session.opened', method, session, actor }),
      context
    )

  it('names a browser by its label, else as a web browser', () => {
    expect(deviceTitle({ platform: 'web', device: 'chrome' }, context)).toBe(
      'Chrome on macOS'
    )
    expect(deviceTitle({ platform: 'web', device: null }, context)).toBe(
      'Web browser'
    )
    expect(deviceTitle({ platform: 'web', device: 'bad' }, context)).toBe(
      'Web browser'
    )
    expect(opened(null, bareBrowser)).toBe('Signed in on a web browser')
  })

  it('shows a browser with the browser icon whatever its label says', () => {
    expect(deviceKind({ platform: 'web', device: 'chrome' }, context)).toBe(
      'browser'
    )
    expect(deviceKind({ platform: 'web', device: null }, context)).toBe(
      'browser'
    )
  })

  it('says how a session opened', () => {
    expect(opened('passkey')).toBe(
      'Signed in on Chrome on macOS with a passkey'
    )
    expect(opened('passkey', bareBrowser)).toBe(
      'Signed in on a web browser with a passkey'
    )
    expect(opened('recovery')).toBe(
      'Signed in on Chrome on macOS with a recovery key'
    )
    expect(opened('signup')).toBe('Signed up on Chrome on macOS')
    expect(opened('approval', chrome, iphone)).toBe(
      'Signed in on Chrome on macOS, approved from iPhone 17'
    )
    expect(opened('approval', chrome, { ...iphone, sessionId: 'me' })).toBe(
      'Signed in on Chrome on macOS, approved from this device'
    )
  })

  it('reads a method-less or phone sign-in as before', () => {
    expect(opened(null)).toBe('Signed in on Chrome on macOS')
    expect(opened('attestation', iphone)).toBe('Signed in on iPhone 17')
    expect(opened('dev', iphone)).toBe('Signed in on iPhone 17')
    // An approval without its phone still says it was approved.
    expect(opened('approval')).toBe(
      'Signed in on Chrome on macOS, approved from another device'
    )
  })

  it('titles passkey and approval entries', () => {
    const title = (
      kind: ActivityEntry['kind'],
      session = iphone as ActivityEntry['session']
    ) => activityTitle(entry({ kind, session }), context)
    expect(title('passkey.added', chrome)).toBe(
      'Passkey added on Chrome on macOS'
    )
    expect(title('passkey.removed')).toBe('Passkey removed on iPhone 17')
    expect(title('passkey.added', null)).toBe('A passkey was added')
    expect(title('passkey.removed', null)).toBe('A passkey was removed')
    expect(title('device.approved')).toBe('Browser approved from iPhone 17')
    expect(title('device.approved', { ...iphone, sessionId: 'me' })).toBe(
      'Browser approved from this device'
    )
    expect(title('device.approved', null)).toBe('A browser was approved')
  })

  it('says a browser signed out by the cap leaves room for three', () => {
    const replaced = entry({
      kind: 'session.replaced',
      session: chrome,
      actor: { ...chrome, sessionId: 'w2' },
    })
    expect(activityTitle(replaced, context)).toBe(
      'Signed out Chrome on macOS when Chrome on macOS signed in'
    )
    expect(activityDetail(replaced)).toBe(
      'Your account stays signed in on up to 3 browsers.'
    )
    expect(
      activityDetail(entry({ kind: 'session.replaced', session: iphone }))
    ).toBe('Your account stays signed in on up to 10 devices.')
  })

  it('picks the cap from the session’s platform, else the actor’s, else says nothing', () => {
    const detail = (
      session: ActivityEntry['session'],
      actor: ActivityEntry['actor']
    ) => activityDetail(entry({ kind: 'session.replaced', session, actor }))
    const unknown = { sessionId: 'u', platform: null, device: null }
    const browsers = 'Your account stays signed in on up to 3 browsers.'
    expect(detail(chrome, iphone)).toBe(browsers)
    expect(detail(unknown, chrome)).toBe(browsers)
    expect(detail(null, chrome)).toBe(browsers)
    expect(detail(unknown, iphone)).toBeNull()
    expect(detail(unknown, unknown)).toBeNull()
    expect(detail(unknown, null)).toBeNull()
    expect(detail(null, null)).toBeNull()
  })

  it('titles a key change', () => {
    const changed = (session: ActivityEntry['session']) =>
      activityTitle(entry({ kind: 'account.key_changed', session }), context)
    expect(changed(iphone)).toBe('Account key changed on iPhone 17')
    expect(changed({ ...iphone, sessionId: 'me' })).toBe(
      'Account key changed on this device'
    )
    expect(changed(null)).toBe('Account key changed')
  })
})

describe('deviceTitle', () => {
  it('uses the label’s name, else the platform', () => {
    expect(deviceTitle({ platform: 'android', device: 'pixel' }, context)).toBe(
      'Pixel 9'
    )
    expect(deviceTitle({ platform: 'ios', device: null }, context)).toBe(
      'iPhone or iPad'
    )
    expect(deviceTitle({ platform: 'dev', device: 'bad' }, context)).toBe(
      'Development build'
    )
  })
})

describe('a device of a platform this version doesn’t know', () => {
  it('is a generic device with a generic icon', () => {
    expect(deviceTitle({ platform: null, device: null }, context)).toBe(
      'Device'
    )
    expect(deviceKind({ platform: null, device: null }, context)).toBe(
      'unknown'
    )
  })
})

describe('deviceKind', () => {
  const kind = (
    device: string | null,
    platform: 'ios' | 'android' | 'dev' | null
  ) => deviceKind({ platform, device }, context)

  it('is a tablet for an iPad or an Android tablet', () => {
    expect(kind('ipad', 'ios')).toBe('tablet')
    expect(kind('ipad', 'dev')).toBe('tablet')
    expect(kind('ipadUnnamed', 'ios')).toBe('tablet')
    expect(kind('pixelTablet', 'android')).toBe('tablet')
  })

  it('goes by the model before the name', () => {
    expect(kind('iphoneNamedIpad', 'ios')).toBe('phone')
  })

  it('is a phone otherwise', () => {
    expect(kind('iphone', 'ios')).toBe('phone')
    expect(kind('pixel', 'android')).toBe('phone')
    expect(kind('pixel', 'dev')).toBe('phone')
    expect(kind(null, 'ios')).toBe('phone')
    expect(kind('bad', 'android')).toBe('phone')
  })

  it('is a computer for a development build without a label', () => {
    expect(kind(null, 'dev')).toBe('computer')
    expect(kind('bad', 'dev')).toBe('computer')
  })
})

describe('activityRows', () => {
  const me = { sessionId: 'me', platform: 'ios' as const, device: null }
  const pixel = {
    sessionId: 'pixel',
    platform: 'android' as const,
    device: 'pixel',
  }
  const downloaded = (
    id: string,
    createdAt: number,
    session: ActivityEntry['session'] = me
  ) =>
    entry({
      id,
      kind: 'backup.downloaded',
      createdAt,
      session,
      slotId: `slot-${id}`,
    })

  it('makes one restore’s downloads one row, keeping the newest entry', () => {
    const rows = activityRows([
      entry({
        id: 'later',
        kind: 'session.opened',
        createdAt: 100_000,
        session: me,
      }),
      downloaded('b', 60_500),
      downloaded('a', 60_000),
      entry({ id: 'earlier', createdAt: 0 }),
    ])
    expect(rows.map((row) => [row.entry.id, row.count])).toEqual([
      ['later', 1],
      ['b', 2],
      ['earlier', 1],
    ])
    expect(activityTitle(rows[1].entry, context, rows[1].count)).toBe(
      '2 backups downloaded on this device'
    )
    expect(activityTitle(rows[1].entry, context)).toBe(
      'Backup downloaded on this device'
    )
  })

  it('keeps downloads apart across devices, other entries, or a later restore', () => {
    const rows = activityRows([
      downloaded('d', 3_000_000),
      downloaded('c', 60_000 + 60_000, pixel),
      downloaded('b', 60_000),
      entry({
        id: 'x',
        kind: 'session.opened',
        createdAt: 50_000,
        session: me,
      }),
      downloaded('a', 40_000),
    ])
    expect(rows.map((row) => row.count)).toEqual([1, 1, 1, 1, 1])
    expect(activityTitle(downloaded('n', 0, null), context, 3)).toBe(
      '3 backups were downloaded'
    )
  })
})
