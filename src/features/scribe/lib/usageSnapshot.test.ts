import { describe, expect, it } from 'vitest'
import {
  currentUsageSnapshot,
  fullWindow,
  nextUsageChange,
  parseUsageSnapshot,
  toScribeUsage,
} from '@/features/scribe/lib/usageSnapshot'
import type { UsageSnapshotWire } from '@/features/scribe/lib/wire'

const AS_OF = 1_790_000_000_000
const DAY_MS = 86_400_000

const free = (change: Partial<UsageSnapshotWire> = {}): UsageSnapshotWire => ({
  plan: 'free',
  supporterCheckFailed: false,
  windows: [{ id: 'monthly', percentUsed: 40, resetsAt: AS_OF + 1_000 }],
  limited: false,
  resetsAt: null,
  asOf: AS_OF,
  ...change,
})

describe('parseUsageSnapshot', () => {
  it('reads a snapshot and keeps units for the Tools', () => {
    expect(
      parseUsageSnapshot({
        ok: true,
        plan: 'supporter',
        supporterCheckFailed: true,
        windows: [
          {
            id: 'session',
            percentUsed: 12.4,
            resetsAt: AS_OF + 5,
            units: { used: 124_000, limit: 1_000_000 },
          },
          { id: 'weekly', percentUsed: 3, resetsAt: null },
        ],
        limited: false,
        resetsAt: null,
        asOf: AS_OF,
      })
    ).toEqual({
      plan: 'supporter',
      supporterCheckFailed: true,
      windows: [
        {
          id: 'session',
          percentUsed: 12,
          resetsAt: AS_OF + 5,
          units: { used: 124_000, limit: 1_000_000 },
        },
        { id: 'weekly', percentUsed: 3, resetsAt: null },
      ],
      limited: false,
      resetsAt: null,
      asOf: AS_OF,
    })
  })

  it('clamps percent to 0–100 and drops windows it can’t read', () => {
    const snapshot = parseUsageSnapshot({
      plan: 'free',
      windows: [
        { id: 'monthly', percentUsed: 140, resetsAt: AS_OF },
        { id: 'session', percentUsed: -3, resetsAt: 'soon' },
        { id: 'yearly', percentUsed: 10 },
        { id: 'weekly', percentUsed: 'x' },
        null,
        { id: 'monthly', percentUsed: 50, units: { used: 1 } },
      ],
      asOf: AS_OF,
    })
    expect(snapshot?.windows).toEqual([
      { id: 'monthly', percentUsed: 100, resetsAt: AS_OF },
      { id: 'session', percentUsed: 0, resetsAt: null },
      { id: 'monthly', percentUsed: 50, resetsAt: null },
    ])
    expect(snapshot).toMatchObject({
      limited: false,
      resetsAt: null,
      supporterCheckFailed: false,
    })
  })

  it('is null for anything that isn’t a snapshot', () => {
    expect(parseUsageSnapshot(null)).toBeNull()
    expect(parseUsageSnapshot([])).toBeNull()
    expect(
      parseUsageSnapshot({ plan: 'gold', windows: [], asOf: AS_OF })
    ).toBeNull()
    expect(parseUsageSnapshot({ plan: 'free', windows: [] })).toBeNull()
    expect(
      parseUsageSnapshot({ plan: 'free', windows: {}, asOf: AS_OF })
    ).toBeNull()
  })
})

describe('toScribeUsage', () => {
  it('free shows its monthly window', () => {
    expect(toScribeUsage(free(), AS_OF)).toEqual({
      plan: 'free',
      windows: [{ id: 'monthly', percentUsed: 40, resetsAt: AS_OF + 1_000 }],
      limited: false,
      resetsAt: null,
      supporterCheckFailed: false,
      asOf: AS_OF,
    })
  })

  it('supporter shows session then weekly, shortest first, never units', () => {
    const usage = toScribeUsage(
      {
        plan: 'supporter',
        supporterCheckFailed: false,
        windows: [
          {
            id: 'weekly',
            percentUsed: 20,
            resetsAt: AS_OF + 7,
            units: { used: 600_000, limit: 3_000_000 },
          },
          { id: 'monthly', percentUsed: 90, resetsAt: AS_OF + 30 },
          { id: 'session', percentUsed: 55, resetsAt: AS_OF + 5 },
        ],
        limited: false,
        resetsAt: null,
        asOf: AS_OF,
      },
      AS_OF
    )
    expect(usage.windows).toEqual([
      { id: 'session', percentUsed: 55, resetsAt: AS_OF + 5 },
      { id: 'weekly', percentUsed: 20, resetsAt: AS_OF + 7 },
    ])
  })

  it('a window that hasn’t started shows 0 % with no reset', () => {
    expect(toScribeUsage(free({ windows: [] }), AS_OF).windows).toEqual([
      { id: 'monthly', percentUsed: 0, resetsAt: null },
    ])
  })

  it('says when it works again only while limited', () => {
    expect(
      toScribeUsage(free({ limited: true, resetsAt: AS_OF + 9 }), AS_OF)
        .resetsAt
    ).toBe(AS_OF + 9)
    expect(
      toScribeUsage(free({ limited: false, resetsAt: AS_OF + 9 }), AS_OF)
        .resetsAt
    ).toBe(null)
  })

  it('keeps a failed Supporter check, metered as free', () => {
    expect(
      toScribeUsage(free({ supporterCheckFailed: true }), AS_OF)
        .supporterCheckFailed
    ).toBe(true)
  })
})

describe('fullWindow', () => {
  it('is the full window of the plan that resets last', () => {
    expect(
      fullWindow({
        plan: 'supporter',
        supporterCheckFailed: false,
        windows: [
          { id: 'session', percentUsed: 100, resetsAt: AS_OF + 5 },
          { id: 'weekly', percentUsed: 100, resetsAt: AS_OF + 7 },
        ],
        limited: true,
        resetsAt: AS_OF + 7,
        asOf: AS_OF,
      })
    ).toBe('weekly')
    expect(
      fullWindow(
        free({
          windows: [{ id: 'monthly', percentUsed: 100, resetsAt: AS_OF }],
        })
      )
    ).toBe('monthly')
  })

  it('is null when nothing is full, or only another plan’s window is', () => {
    expect(fullWindow(free())).toBeNull()
    expect(
      fullWindow(
        free({ windows: [{ id: 'weekly', percentUsed: 100, resetsAt: AS_OF }] })
      )
    ).toBeNull()
  })
})

describe('currentUsageSnapshot', () => {
  const supporter = (
    change: Partial<UsageSnapshotWire> = {}
  ): UsageSnapshotWire => ({
    plan: 'supporter',
    supporterCheckFailed: false,
    windows: [
      {
        id: 'session',
        percentUsed: 100,
        resetsAt: AS_OF + 1_000,
        units: { used: 450_000, limit: 450_000 },
      },
      { id: 'weekly', percentUsed: 40, resetsAt: AS_OF + 9_000 },
    ],
    limited: true,
    resetsAt: AS_OF + 1_000,
    asOf: AS_OF,
    ...change,
  })

  it('is the snapshot itself until something resets', () => {
    const snapshot = supporter()
    expect(currentUsageSnapshot(snapshot, AS_OF + 999)).toBe(snapshot)
  })

  it('reads a reset window as unused and not started, and lifts its limit', () => {
    expect(currentUsageSnapshot(supporter(), AS_OF + 1_000)).toEqual({
      ...supporter(),
      windows: [
        {
          id: 'session',
          percentUsed: 0,
          resetsAt: null,
          units: { used: 0, limit: 450_000 },
        },
        { id: 'weekly', percentUsed: 40, resetsAt: AS_OF + 9_000 },
      ],
      limited: false,
      resetsAt: null,
    })
  })

  it('stays limited until the last full window resets', () => {
    const both = supporter({
      windows: [
        { id: 'session', percentUsed: 100, resetsAt: AS_OF + 1_000 },
        { id: 'weekly', percentUsed: 100, resetsAt: AS_OF + 9_000 },
      ],
      resetsAt: AS_OF + 9_000,
    })
    const later = currentUsageSnapshot(both, AS_OF + 5_000)
    expect(later.limited).toBe(true)
    expect(later.resetsAt).toBe(AS_OF + 9_000)
    expect(later.windows[0]).toMatchObject({ percentUsed: 0, resetsAt: null })
    expect(currentUsageSnapshot(both, AS_OF + 9_000).limited).toBe(false)
  })

  it('keeps a limit with no reset (a zero allowance)', () => {
    const none = free({ windows: [], limited: true, resetsAt: null })
    expect(currentUsageSnapshot(none, AS_OF + DAY_MS)).toBe(none)
  })

  it('shows a saved limit as lifted once its reset passes', () => {
    const usage = toScribeUsage(
      free({
        windows: [{ id: 'monthly', percentUsed: 100, resetsAt: AS_OF + 5 }],
        limited: true,
        resetsAt: AS_OF + 5,
      }),
      AS_OF + 5
    )
    expect(usage).toMatchObject({
      limited: false,
      resetsAt: null,
      windows: [{ id: 'monthly', percentUsed: 0, resetsAt: null }],
    })
  })
})

describe('nextUsageChange', () => {
  it('is the soonest reset still ahead', () => {
    expect(nextUsageChange(null, AS_OF)).toBeNull()
    expect(nextUsageChange(free({ windows: [] }), AS_OF)).toBeNull()
    expect(
      nextUsageChange(
        free({
          windows: [{ id: 'monthly', percentUsed: 3, resetsAt: AS_OF + 50 }],
        }),
        AS_OF
      )
    ).toBe(AS_OF + 50)
    expect(
      nextUsageChange(
        free({
          windows: [{ id: 'monthly', percentUsed: 3, resetsAt: AS_OF - 1 }],
        }),
        AS_OF
      )
    ).toBeNull()
  })
})
