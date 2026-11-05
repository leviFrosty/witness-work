import { describe, expect, it, vi } from 'vitest'
import {
  applySignInActivity,
  countBucket,
  createSignInNoticeChecker,
  SIGN_IN_MARKER_MAX_IDS,
  SIGN_IN_MARKER_OVERLAP_MS,
  SIGN_IN_NOTICE_FAILURE_BACKOFF_MS,
  SIGN_IN_NOTICE_MAX_PAGES,
  SIGN_IN_NOTICE_THROTTLE_MS,
  SIGN_IN_NOTICES_INITIAL,
  type SignInNoticesState,
} from '@/app/account/signInNotices'
import type {
  ActivityEntry,
  SessionMethod,
  SessionPlatform,
} from '@/lib/serverAccount/activityClient'

const T0 = Date.UTC(2026, 10, 1, 12)
const OWN = 'own-session-0000000000'
const OTHER = 'other-session-00000000'
const PHONE = 'phone-session-00000000'

let nextId = 0
const entry = (
  kind: ActivityEntry['kind'],
  createdAt: number,
  options: {
    session?: string
    platform?: SessionPlatform
    device?: string | null
    method?: SessionMethod
    actor?: string
    id?: string
  } = {}
): ActivityEntry => ({
  id: options.id ?? `e${++nextId}`,
  kind,
  createdAt,
  session: {
    sessionId: options.session ?? OTHER,
    platform: options.platform ?? 'web',
    device: options.device === undefined ? 'Chrome on macOS' : options.device,
  },
  method: options.method ?? null,
  actor: options.actor
    ? { sessionId: options.actor, platform: 'ios', device: 'Pixel 8' }
    : null,
  slotId: null,
})

/** Newest first, as the server answers. */
const newestFirst = (entries: ActivityEntry[]) =>
  [...entries].sort((a, b) => b.createdAt - a.createdAt)

const deps = {
  isThisDevice: (sessionId: string) => sessionId === OWN,
  // The test's "sealed" labels are already their names.
  readName: (sealed: string | null) => sealed,
}

const apply = (
  state: SignInNoticesState,
  entries: ActivityEntry[],
  account = 'acct-1',
  complete = true
) =>
  applySignInActivity(state, {
    account,
    entries: newestFirst(entries),
    complete,
    ...deps,
  })

/** A state that already read once, up to `at`. */
const started = (at = T0, account = 'acct-1') =>
  apply(SIGN_IN_NOTICES_INITIAL, [entry('session.opened', at)], account)

describe('applySignInActivity', () => {
  it('only sets the marker on the first read', () => {
    const state = apply(SIGN_IN_NOTICES_INITIAL, [
      entry('session.opened', T0 - 1000, { id: 'old' }),
      entry('passkey.added', T0, { id: 'newest' }),
    ])
    expect(state.account).toBe('acct-1')
    // Ids within the overlap of the newest are kept.
    expect(state.marker).toEqual({ at: T0, ids: ['newest', 'old'] })
    expect(state.notices).toEqual([])
  })

  it('sets an empty marker when the account has no activity yet', () => {
    const state = apply(SIGN_IN_NOTICES_INITIAL, [])
    expect(state.marker).toEqual({ at: 0, ids: [] })
    const next = apply(state, [entry('session.opened', T0)])
    expect(next.notices).toHaveLength(1)
  })

  it('lists sign-ins, approvals and passkeys newer than the marker', () => {
    const state = apply(started(), [
      entry('session.opened', T0 - SIGN_IN_MARKER_OVERLAP_MS - 1, {
        id: 'older',
      }),
      entry('session.opened', T0 + 10, { method: 'passkey' }),
      entry('passkey.added', T0 + 20, { platform: 'ios', device: 'iPad' }),
      entry('session.opened', T0 + 30, {
        method: 'approval',
        actor: PHONE,
        session: 'browser-session-000000',
      }),
      entry('device.approved', T0 + 25, { session: PHONE, platform: 'ios' }),
      entry('backup.downloaded', T0 + 40),
      entry('session.signed_out', T0 + 50),
    ])
    expect(state.marker?.at).toBe(T0 + 50)
    expect(
      state.notices.map(({ kind, count, at }) => ({ kind, count, at }))
    ).toEqual([
      { kind: 'approval', count: 1, at: T0 + 30 },
      { kind: 'passkey', count: 1, at: T0 + 20 },
      { kind: 'session', count: 1, at: T0 + 10 },
    ])
    const session = state.notices.find((n) => n.kind === 'session')
    expect(session).toMatchObject({
      device: { name: 'Chrome on macOS', platform: 'web' },
      method: 'passkey',
    })
    const approval = state.notices.find((n) => n.kind === 'approval')
    expect(approval?.actor).toEqual({ name: 'Pixel 8', platform: 'ios' })
  })

  it('skips an entry it already saw at the marker’s time', () => {
    const first = apply(SIGN_IN_NOTICES_INITIAL, [
      entry('session.opened', T0, { id: 'same-ms' }),
    ])
    const next = apply(first, [
      entry('session.opened', T0, { id: 'same-ms' }),
      entry('session.opened', T0, { id: 'also-same-ms' }),
    ])
    expect(next.notices).toHaveLength(1)
    expect(next.notices[0].id).toBe('sign_in:session:also-same-ms')
    expect(next.marker).toEqual({ at: T0, ids: ['same-ms', 'also-same-ms'] })
  })

  it("leaves out this device's own sign-ins, Sign In Again and passkeys", () => {
    const state = apply(started(), [
      entry('session.opened', T0 + 1, { session: OWN, method: 'recovery' }),
      entry('session.opened', T0 + 2, { session: OWN, method: 'attestation' }),
      entry('passkey.added', T0 + 3, { session: OWN }),
      entry('device.approved', T0 + 4, { session: OWN }),
    ])
    expect(state.notices).toEqual([])
    expect(state.marker?.at).toBe(T0 + 4)
  })

  it('leaves out a browser this device approved', () => {
    const state = apply(started(), [
      entry('device.approved', T0 + 1, { session: OWN }),
      entry('session.opened', T0 + 2, { method: 'approval', actor: OWN }),
    ])
    expect(state.notices).toEqual([])
  })

  it('shows one row for a browser another phone approved', () => {
    const state = apply(started(), [
      entry('device.approved', T0 + 1, { session: PHONE, platform: 'ios' }),
      entry('session.opened', T0 + 2, { method: 'approval', actor: PHONE }),
    ])
    expect(state.notices).toHaveLength(1)
    expect(state.notices[0]).toMatchObject({ kind: 'approval', count: 1 })
  })

  it('a browser leaves out its own approval, made on a phone', () => {
    // The browser's own session.opened names the phone that approved it.
    const state = apply(started(), [
      entry('device.approved', T0 + 1, { session: PHONE, platform: 'ios' }),
      entry('session.opened', T0 + 2, {
        session: OWN,
        method: 'approval',
        actor: PHONE,
      }),
    ])
    expect(state.notices).toEqual([])
  })

  it('lists an approval the browser’s sign-in isn’t in this page for', () => {
    const state = apply(started(), [
      entry('device.approved', T0 + 1, {
        session: PHONE,
        platform: 'ios',
        device: 'Pixel 8',
      }),
    ])
    expect(state.notices).toHaveLength(1)
    expect(state.notices[0]).toMatchObject({
      kind: 'approval',
      device: { name: 'Pixel 8', platform: 'ios' },
    })
  })

  it('collapses a burst into one row per kind, naming the newest', () => {
    const state = apply(started(), [
      entry('session.opened', T0 + 1, { device: 'Firefox on Windows' }),
      entry('session.opened', T0 + 2, { device: 'Safari on macOS' }),
      entry('session.opened', T0 + 3, { device: 'Edge on Windows', id: 'n' }),
      entry('passkey.added', T0 + 4),
      entry('passkey.added', T0 + 5),
    ])
    const session = state.notices.find((n) => n.kind === 'session')
    expect(session).toMatchObject({
      id: 'sign_in:session:n',
      count: 3,
      at: T0 + 3,
      device: { name: 'Edge on Windows' },
    })
    expect(state.notices.find((n) => n.kind === 'passkey')?.count).toBe(2)
  })

  it('adds later sign-ins to a row still in the tray, as a new row id', () => {
    const seen = entry('session.opened', T0 + 1)
    const first = apply(started(), [seen])
    const shown = {
      ...first,
      notices: first.notices.map((n) => ({ ...n, shown: true })),
    }
    const next = apply(shown, [
      seen,
      entry('session.opened', T0 + 2, { id: 'later' }),
    ])
    expect(next.notices).toHaveLength(1)
    expect(next.notices[0]).toMatchObject({
      id: 'sign_in:session:later',
      count: 2,
      shown: false,
    })
  })

  it('starts over for another account', () => {
    const first = apply(started(), [entry('session.opened', T0 + 1)])
    expect(first.notices).toHaveLength(1)
    const other = apply(
      first,
      [entry('session.opened', T0 + 10, { id: 'b-newest' })],
      'acct-2'
    )
    expect(other).toMatchObject({
      account: 'acct-2',
      marker: { at: T0 + 10, ids: ['b-newest'] },
      notices: [],
    })
  })

  it('names a device without a readable label by its platform', () => {
    const state = apply(started(), [
      entry('session.opened', T0 + 1, { device: null, platform: 'android' }),
    ])
    expect(state.notices[0].device).toEqual({
      name: null,
      platform: 'android',
    })
  })
})

describe('applySignInActivity: the marker', () => {
  it('lists an entry committed late, just below the marker, once', () => {
    const first = apply(SIGN_IN_NOTICES_INITIAL, [
      entry('session.opened', T0, { id: 'seen' }),
    ])
    const late = entry('session.opened', T0 - 3_000, { id: 'late' })
    const next = apply(first, [
      entry('session.opened', T0, { id: 'seen' }),
      late,
    ])
    expect(next.notices.map((n) => n.id)).toEqual(['sign_in:session:late'])
    expect(next.marker).toEqual({ at: T0, ids: ['seen', 'late'] })
    // Read again: already counted.
    const again = apply({ ...next, notices: [] }, [
      entry('session.opened', T0, { id: 'seen' }),
      late,
    ])
    expect(again.notices).toEqual([])
  })

  it('leaves out entries older than the overlap', () => {
    const first = started()
    const next = apply(first, [
      entry('session.opened', T0 - SIGN_IN_MARKER_OVERLAP_MS - 1),
    ])
    expect(next.notices).toEqual([])
  })

  it('keeps at most a bounded set of ids', () => {
    const burst = Array.from({ length: SIGN_IN_MARKER_MAX_IDS + 50 }, (_, i) =>
      entry('backup.downloaded', T0 + i)
    )
    const next = apply(started(), burst)
    expect(next.marker?.ids).toHaveLength(SIGN_IN_MARKER_MAX_IDS)
    expect(next.marker?.at).toBe(T0 + SIGN_IN_MARKER_MAX_IDS + 49)
  })

  it('lists one overflow row for a read that didn’t reach the marker', () => {
    const state = apply(
      started(),
      [
        entry('session.opened', T0 + 60_000, { id: 'a' }),
        entry('backup.downloaded', T0 + 70_000, { id: 'b' }),
        entry('passkey.added', T0 + 80_000, { id: 'newest' }),
      ],
      'acct-1',
      false
    )
    expect(state.notices).toEqual([
      expect.objectContaining({
        id: 'sign_in:overflow:newest',
        kind: 'overflow',
        entryKind: null,
        count: 3,
        at: T0 + 80_000,
      }),
    ])
    // Only as far as it read.
    expect(state.marker?.at).toBe(T0 + 80_000)
  })

  it('counts what an overflow read got through, without adding up', () => {
    const read = (from: number) =>
      Array.from({ length: 4 }, (_, i) =>
        entry('backup.downloaded', from + i * 1000)
      )
    const first = apply(started(), read(T0 + 60_000), 'acct-1', false)
    const second = apply(first, read(T0 + 600_000), 'acct-1', false)
    expect(second.notices).toEqual([
      expect.objectContaining({ kind: 'overflow', count: 4 }),
    ])
  })

  it('stores the entry kind each row stands for', () => {
    const state = apply(started(), [
      entry('device.approved', T0 + 1, { session: PHONE }),
      entry('passkey.added', T0 + 2),
      entry('session.opened', T0 + 3),
    ])
    expect(
      Object.fromEntries(state.notices.map((n) => [n.kind, n.entryKind]))
    ).toEqual({
      approval: 'device.approved',
      passkey: 'passkey.added',
      session: 'session.opened',
    })
  })
})

describe('countBucket', () => {
  it('buckets counts', () => {
    expect([1, 2, 4, 5, 40].map(countBucket)).toEqual([
      '1',
      '2_4',
      '2_4',
      '5_plus',
      '5_plus',
    ])
  })
})

describe('createSignInNoticeChecker', () => {
  type Page = { entries: ActivityEntry[]; nextCursor: string | null }
  const setup = (
    options: {
      account?: string | null
      pages?: (before: string | null) => Promise<Page>
    } = {}
  ) => {
    let state = SIGN_IN_NOTICES_INITIAL
    let now = T0
    const loadPage = vi.fn(
      options.pages ??
        (async () => ({
          entries: [entry('session.opened', T0)],
          nextCursor: null,
        }))
    )
    const checker = createSignInNoticeChecker({
      account: async () =>
        options.account === undefined ? 'acct-1' : options.account,
      loadPage: async (before) => ({ ...(await loadPage(before)), ...deps }),
      getState: () => state,
      setState: (next) => {
        state = next
      },
      now: () => now,
    })
    return {
      checker,
      loadPage,
      state: () => state,
      setState: (next: SignInNoticesState) => {
        state = next
      },
      advance: (ms: number) => {
        now += ms
      },
    }
  }

  /** A feed of `count` entries a second apart, newest first, 50 a page. */
  const feed = (newest: number, count: number) => {
    const all = Array.from({ length: count }, (_, i) =>
      entry('session.opened', newest - i * 1000, { id: `f${i}` })
    )
    return async (before: string | null): Promise<Page> => {
      const start = before ? Number(before) : 0
      const entries = all.slice(start, start + 50)
      return {
        entries,
        nextCursor: start + 50 < all.length ? String(start + 50) : null,
      }
    }
  }

  it('reads at most every 15 minutes in the foreground', async () => {
    const { checker, loadPage, advance } = setup()
    await checker.check()
    await checker.check()
    expect(loadPage).toHaveBeenCalledTimes(1)
    advance(SIGN_IN_NOTICE_THROTTLE_MS - 1)
    await checker.check()
    expect(loadPage).toHaveBeenCalledTimes(1)
    advance(1)
    await checker.check()
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('reads again at once when Settings → Account opens', async () => {
    const { checker, loadPage } = setup()
    await checker.check()
    await checker.check({ force: true })
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('reads a new account at once, even within the 15 minutes', async () => {
    let account = 'acct-1'
    let state = SIGN_IN_NOTICES_INITIAL
    const loadPage = vi.fn(async () => ({
      entries: [entry('session.opened', T0)],
      nextCursor: null,
      ...deps,
    }))
    const checker = createSignInNoticeChecker({
      account: async () => account,
      loadPage,
      getState: () => state,
      setState: (next) => {
        state = next
      },
      now: () => T0,
    })
    await checker.check()
    account = 'acct-2'
    await checker.check()
    expect(loadPage).toHaveBeenCalledTimes(2)
    expect(state.account).toBe('acct-2')
  })

  it('treats a clock set back as due', async () => {
    const { checker, loadPage, advance } = setup()
    await checker.check()
    advance(-60_000)
    await checker.check()
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('stays silent when the read fails, and backs off before trying again', async () => {
    let fail = true
    const { checker, loadPage, state, advance } = setup({
      pages: async () => {
        if (fail) throw new Error('offline')
        return { entries: [entry('session.opened', T0)], nextCursor: null }
      },
    })
    await expect(checker.check()).resolves.toBeUndefined()
    expect(state()).toEqual(SIGN_IN_NOTICES_INITIAL)
    fail = false
    // Focus and foreground wait out the backoff.
    advance(SIGN_IN_NOTICE_FAILURE_BACKOFF_MS - 1)
    await checker.check()
    expect(loadPage).toHaveBeenCalledTimes(1)
    advance(1)
    await checker.check()
    expect(loadPage).toHaveBeenCalledTimes(2)
    expect(state().marker?.at).toBe(T0)
  })

  it('backs off per account: another account reads at once', async () => {
    let account = 'acct-1'
    let state = SIGN_IN_NOTICES_INITIAL
    const loadPage = vi.fn(async () => {
      if (account === 'acct-1') throw new Error('busy')
      return { entries: [], nextCursor: null, ...deps }
    })
    const checker = createSignInNoticeChecker({
      account: async () => account,
      loadPage,
      getState: () => state,
      setState: (next) => {
        state = next
      },
      now: () => T0,
    })
    await checker.check()
    account = 'acct-2'
    await checker.check()
    expect(loadPage).toHaveBeenCalledTimes(2)
    expect(state.account).toBe('acct-2')
  })

  it('a forced check doesn’t wait out the backoff', async () => {
    let fail = true
    const { checker, loadPage } = setup({
      pages: async () => {
        if (fail) throw new Error('busy')
        return { entries: [], nextCursor: null }
      },
    })
    await checker.check()
    fail = false
    await checker.check({ force: true })
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('reads nothing without a session', async () => {
    const { checker, loadPage, state } = setup({ account: null })
    await checker.check({ force: true })
    expect(loadPage).not.toHaveBeenCalled()
    expect(state()).toEqual(SIGN_IN_NOTICES_INITIAL)
  })

  it('shares one read between foreground triggers that arrive together', async () => {
    const { checker, loadPage } = setup()
    await Promise.all([checker.check(), checker.check()])
    expect(loadPage).toHaveBeenCalledTimes(1)
  })

  it('runs a forced check after a foreground read in flight', async () => {
    const { checker, loadPage, advance } = setup()
    await checker.check()
    advance(SIGN_IN_NOTICE_THROTTLE_MS)
    // The foreground read is in flight when Settings → Account opens.
    await Promise.all([checker.check(), checker.check({ force: true })])
    expect(loadPage).toHaveBeenCalledTimes(3)
  })

  it('a forced check joining a throttled foreground check still reads', async () => {
    const { checker, loadPage } = setup()
    await checker.check()
    await Promise.all([checker.check(), checker.check({ force: true })])
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('drops an answer for an account that changed meanwhile', async () => {
    let account = 'acct-1'
    let state = SIGN_IN_NOTICES_INITIAL
    const checker = createSignInNoticeChecker({
      account: async () => account,
      loadPage: async () => {
        account = 'acct-2'
        return {
          entries: [entry('session.opened', T0)],
          nextCursor: null,
          ...deps,
        }
      },
      getState: () => state,
      setState: (next) => {
        state = next
      },
      now: () => T0,
    })
    await checker.check()
    expect(state).toEqual(SIGN_IN_NOTICES_INITIAL)
  })

  it('reads only the newest page on a first read', async () => {
    const { checker, loadPage, state } = setup({ pages: feed(T0, 120) })
    await checker.check()
    expect(loadPage).toHaveBeenCalledTimes(1)
    expect(state().marker?.at).toBe(T0)
  })

  it('pages back until it reaches the marker', async () => {
    const { checker, loadPage, state, setState } = setup({
      pages: feed(T0 + 120_000, 200),
    })
    // Last read up to 120 entries ago: 120 new sign-ins over three pages.
    setState({
      ...SIGN_IN_NOTICES_INITIAL,
      account: 'acct-1',
      marker: { at: T0, ids: [] },
    })
    await checker.check({ force: true })
    expect(loadPage.mock.calls.map(([before]) => before)).toEqual([
      null,
      '50',
      '100',
    ])
    // Entries from T0 - 5 s up are within the overlap; the 120 newer ones
    // (and the 5 just below the marker) are listed.
    expect(state().notices).toEqual([
      expect.objectContaining({ kind: 'session', count: 126 }),
    ])
    expect(state().marker?.at).toBe(T0 + 120_000)
  })

  it('stops after the page cap with one row for Account Activity', async () => {
    const pages = SIGN_IN_NOTICE_MAX_PAGES
    const { checker, loadPage, state, setState } = setup({
      pages: feed(T0 + 1_000_000, 1000),
    })
    setState({
      ...SIGN_IN_NOTICES_INITIAL,
      account: 'acct-1',
      marker: { at: T0, ids: [] },
    })
    await checker.check({ force: true })
    expect(loadPage).toHaveBeenCalledTimes(pages)
    expect(state().notices).toEqual([
      expect.objectContaining({ kind: 'overflow', count: pages * 50 }),
    ])
    expect(state().marker?.at).toBe(T0 + 1_000_000)
  })
})
