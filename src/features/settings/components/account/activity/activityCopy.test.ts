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
    expect(kind(null, null)).toBe('phone')
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
