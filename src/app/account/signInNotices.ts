import type {
  ActivityEntry,
  ActivityPage,
  ActivitySession,
  SessionMethod,
  SessionPlatform,
} from '@/lib/serverAccount/activityClient'

/**
 * Notices for new sign-ins on the account's other devices (ADR 0038 §9;
 * docs/passkeys-protocol.md, "Signed-in devices and new sign-ins"). The app
 * reads the newest activity when it comes to the foreground (at most every 15
 * minutes) and when Settings → Account opens, and puts each `session.opened`,
 * `passkey.added` and `device.approved` that isn't this device's, newer than
 * the last one it saw, in the notifications tray.
 *
 * The marker is per account: the first read for an account (after this device
 * signs in, or on an install that never read) only sets where it starts.
 */

/** Analytics' `kind`, and one tray row each. */
export type SignInNoticeKind = 'session' | 'approval' | 'passkey' | 'overflow'

/** The entry kinds a notice can stand for. */
export type NoticeEntryKind =
  | 'session.opened'
  | 'passkey.added'
  | 'device.approved'

/** A device as a notice names it: its opened label, else its platform. */
export type NoticeDevice = {
  name: string | null
  platform: SessionPlatform | null
}

/**
 * One tray row: every new entry of its kind since the User last cleared it,
 * named by the newest. Its id is the newest entry's, so a later one brings the
 * row back as new. An `overflow` row stands for a read that stopped before
 * reaching the marker (`SIGN_IN_NOTICE_MAX_PAGES`).
 */
export type SignInNotice = {
  id: string
  kind: SignInNoticeKind
  /** The newest entry's kind; null for `overflow`. */
  entryKind: NoticeEntryKind | null
  /** The newest entry's time (server ms). */
  at: number
  count: number
  device: NoticeDevice | null
  /** `session.opened`: how it opened. */
  method: SessionMethod | null
  /** An approval's phone. */
  actor: NoticeDevice | null
  /** `sign_in_notice_shown` was sent for this id. */
  shown: boolean
}

/**
 * The newest entry seen (`at`, server ms), and the ids seen within
 * `SIGN_IN_MARKER_OVERLAP_MS` of it: an entry the server committed late can
 * land just below the newest one, so reads look that far back and skip only the
 * ids already counted.
 */
export type SignInMarker = { at: number; ids: string[] }

export type SignInNoticesState = {
  /** The account the marker belongs to. */
  account: string | null
  marker: SignInMarker | null
  /** The last read that worked (device ms), for the throttle. */
  readAt: number | null
  notices: SignInNotice[]
}

export const SIGN_IN_NOTICES_INITIAL: SignInNoticesState = {
  account: null,
  marker: null,
  readAt: null,
  notices: [],
}

/** Foreground reads at most this often. */
export const SIGN_IN_NOTICE_THROTTLE_MS = 15 * 60_000

/** After a failed read, foreground and focus checks wait this long. */
export const SIGN_IN_NOTICE_FAILURE_BACKOFF_MS = 90_000

/** How far below the newest entry seen a read still looks. */
export const SIGN_IN_MARKER_OVERLAP_MS = 5_000

/** Ids kept in the marker, at most. */
export const SIGN_IN_MARKER_MAX_IDS = 200

/** Pages (of 50) read toward the marker before giving up with `overflow`. */
export const SIGN_IN_NOTICE_MAX_PAGES = 5

/** How far apart a phone's approval and the browser's sign-in can be logged. */
const APPROVAL_PAIR_MS = 10 * 60_000

export type SignInActivityDeps = {
  /** Whether a session was this install's, now or before. */
  isThisDevice: (sessionId: string) => boolean
  /** A sealed label's device name, or null when it won't open. */
  readName: (sealed: string | null) => string | null
}

const noticeDevice = (
  session: ActivitySession | null,
  readName: SignInActivityDeps['readName']
): NoticeDevice | null =>
  session
    ? {
        name: readName(session.device)?.trim() || null,
        platform: session.platform,
      }
    : null

/** Entries the marker hasn't counted yet. */
const unseen = (entries: readonly ActivityEntry[], marker: SignInMarker) => {
  const floor = marker.at - SIGN_IN_MARKER_OVERLAP_MS
  const seen = new Set(marker.ids)
  return entries.filter(
    (entry) => entry.createdAt >= floor && !seen.has(entry.id)
  )
}

/**
 * The marker after a read: its newest entry, and every id read within the
 * overlap of it. A read always covers that window, since it pages back past the
 * old one.
 */
function nextMarker(
  marker: SignInMarker | null,
  entries: readonly ActivityEntry[]
): SignInMarker {
  const at = entries.reduce(
    (max, entry) => Math.max(max, entry.createdAt),
    marker?.at ?? 0
  )
  const floor = at - SIGN_IN_MARKER_OVERLAP_MS
  const recent = entries
    .filter((entry) => entry.createdAt >= floor)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((entry) => entry.id)
  // Ids the old marker kept that this read didn't return again (an entry the
  // page didn't repeat) still count while they're in the window.
  const kept =
    marker && marker.at >= floor
      ? marker.ids.filter((id) => !recent.includes(id))
      : []
  return { at, ids: [...recent, ...kept].slice(0, SIGN_IN_MARKER_MAX_IDS) }
}

/**
 * The tray kind of an entry, or null for one this device caused or that the
 * notices skip.
 */
function kindOf(
  entry: ActivityEntry,
  read: readonly ActivityEntry[],
  isThisDevice: SignInActivityDeps['isThisDevice']
): Exclude<SignInNoticeKind, 'overflow'> | null {
  const mine = (session: ActivitySession | null) =>
    session !== null && isThisDevice(session.sessionId)
  switch (entry.kind) {
    case 'session.opened':
      // Its own sign-ins and Sign In Again, and a browser this phone approved.
      if (mine(entry.session) || mine(entry.actor)) return null
      return entry.method === 'approval' ? 'approval' : 'session'
    case 'passkey.added':
      return mine(entry.session) ? null : 'passkey'
    case 'device.approved': {
      if (mine(entry.session)) return null
      // The browser's own sign-in says it: one row, which names the browser.
      const phone = entry.session?.sessionId
      const paired = read.some(
        (other) =>
          other.kind === 'session.opened' &&
          other.method === 'approval' &&
          phone !== undefined &&
          other.actor?.sessionId === phone &&
          Math.abs(other.createdAt - entry.createdAt) <= APPROVAL_PAIR_MS
      )
      return paired ? null : 'approval'
    }
    default:
      return null
  }
}

/** Adds `row` to its kind's row in `notices`, or as a new one. */
function joinRow(
  notices: SignInNotice[],
  row: Omit<SignInNotice, 'count'>,
  count: number
) {
  const index = notices.findIndex((notice) => notice.kind === row.kind)
  if (index === -1) notices.push({ ...row, count })
  else notices[index] = { ...row, count: notices[index].count + count }
}

/**
 * The state after reading the newest activity (`entries`, newest first, every
 * page read) for `account`. Another account, or none read yet, only sets the
 * marker. Otherwise each new entry joins its kind's row: a burst is one row
 * with a count, named by the newest. A read that didn't reach the marker
 * (`complete: false`) lists one `overflow` row instead, for Account Activity.
 */
export function applySignInActivity(
  state: SignInNoticesState,
  input: SignInActivityDeps & {
    account: string
    entries: readonly ActivityEntry[]
    complete: boolean
  }
): SignInNoticesState {
  const { account, entries, isThisDevice, readName } = input
  if (state.account !== account || state.marker === null)
    return {
      account,
      marker: nextMarker(null, entries),
      readAt: state.account === account ? state.readAt : null,
      notices: [],
    }
  const fresh = unseen(entries, state.marker)
  const notices = [...state.notices]
  if (!input.complete && fresh.length > 0) {
    // "250+ changes": as many as the read got through, every one newer than
    // the marker. Another overflow replaces the row rather than adding to it.
    const newest = fresh.reduce((a, b) => (b.createdAt > a.createdAt ? b : a))
    const others = notices.filter((notice) => notice.kind !== 'overflow')
    notices.splice(0, notices.length, ...others, {
      id: `sign_in:overflow:${newest.id}`,
      kind: 'overflow',
      entryKind: null,
      at: newest.createdAt,
      count: fresh.length,
      device: null,
      method: null,
      actor: null,
      shown: false,
    })
  } else
    // Oldest first, so the newest of each kind names its row.
    for (const entry of [...fresh].sort((a, b) => a.createdAt - b.createdAt)) {
      const kind = kindOf(entry, entries, isThisDevice)
      if (!kind) continue
      const opened = entry.kind === 'session.opened'
      joinRow(
        notices,
        {
          id: `sign_in:${kind}:${entry.id}`,
          kind,
          entryKind: entry.kind as NoticeEntryKind,
          at: entry.createdAt,
          device: noticeDevice(entry.session, readName),
          method: opened ? entry.method : null,
          actor: opened ? noticeDevice(entry.actor, readName) : null,
          shown: false,
        },
        1
      )
    }
  notices.sort((a, b) => b.at - a.at)
  return {
    account,
    marker: nextMarker(state.marker, entries),
    readAt: state.readAt,
    notices,
  }
}

/** Analytics' `count`: bounded. */
export const countBucket = (count: number): '1' | '2_4' | '5_plus' =>
  count <= 1 ? '1' : count < 5 ? '2_4' : '5_plus'

export type SignInNoticeCheckerDeps = {
  /** The current session's account, without opening one; null without one. */
  account: () => Promise<string | null>
  /** One page of activity, newest first, and how to read it. */
  loadPage: (
    before: string | null
  ) => Promise<ActivityPage & SignInActivityDeps>
  getState: () => SignInNoticesState
  setState: (state: SignInNoticesState) => void
  now: () => number
  onError?: (error: unknown) => void
}

/**
 * Runs the reads. A foreground check reads at most every
 * `SIGN_IN_NOTICE_THROTTLE_MS` per account, and waits
 * `SIGN_IN_NOTICE_FAILURE_BACKOFF_MS` after a read that failed; Settings →
 * Account forces one. Checks that arrive while one reads share it, except a
 * forced one joining a foreground read, which runs again after it. A read pages
 * back until it reaches the marker, at most `SIGN_IN_NOTICE_MAX_PAGES`. A
 * failed read changes nothing; an answer for an account that changed meanwhile
 * is dropped.
 */
export function createSignInNoticeChecker(deps: SignInNoticeCheckerDeps) {
  let current: { promise: Promise<void>; force: boolean } | null = null
  let forcedNext: Promise<void> | null = null
  /** The last failed read: whose, and when (device ms). */
  let failed: { account: string; at: number } | null = null

  const due = (account: string, force: boolean) => {
    if (force) return true
    const now = deps.now()
    if (failed?.account === account) {
      const sinceFailure = now - failed.at
      if (sinceFailure >= 0 && sinceFailure < SIGN_IN_NOTICE_FAILURE_BACKOFF_MS)
        return false
    }
    const { account: last, readAt } = deps.getState()
    if (last !== account || readAt === null) return true
    const age = now - readAt
    return age < 0 || age >= SIGN_IN_NOTICE_THROTTLE_MS
  }

  /** Every page back to the marker (or just the newest, on a first read). */
  const readPages = async (account: string) => {
    const state = deps.getState()
    const marker = state.account === account ? state.marker : null
    const floor = marker ? marker.at - SIGN_IN_MARKER_OVERLAP_MS : null
    const entries: ActivityEntry[] = []
    let before: string | null = null
    let context: SignInActivityDeps | null = null
    for (let page = 0; page < SIGN_IN_NOTICE_MAX_PAGES; page++) {
      const read: ActivityPage & SignInActivityDeps =
        await deps.loadPage(before)
      context ??= { isThisDevice: read.isThisDevice, readName: read.readName }
      entries.push(...read.entries)
      const reached =
        floor === null ||
        read.nextCursor === null ||
        read.entries.some((entry) => entry.createdAt < floor)
      if (reached) return { ...context, entries, complete: true }
      before = read.nextCursor
    }
    return { ...context!, entries, complete: false }
  }

  const run = async (force: boolean) => {
    const account = await deps.account()
    if (!account || !due(account, force)) return
    let read: Awaited<ReturnType<typeof readPages>>
    try {
      read = await readPages(account)
    } catch (error) {
      failed = { account, at: deps.now() }
      deps.onError?.(error)
      return
    }
    failed = null
    if ((await deps.account()) !== account) return
    const next = applySignInActivity(deps.getState(), {
      account,
      entries: read.entries,
      complete: read.complete,
      isThisDevice: read.isThisDevice,
      readName: read.readName,
    })
    deps.setState({ ...next, readAt: deps.now() })
  }

  const start = (force: boolean) => {
    const promise = run(force).finally(() => {
      current = null
    })
    current = { promise, force }
    return promise
  }

  const check = (options: { force?: boolean } = {}): Promise<void> => {
    const force = options.force ?? false
    if (!current) return start(force)
    if (!force || current.force) return current.promise
    // A foreground read may have skipped (throttled): read again after it.
    forcedNext ??= current.promise.then(() => {
      forcedNext = null
      return check({ force: true })
    })
    return forcedNext
  }

  return { check }
}
