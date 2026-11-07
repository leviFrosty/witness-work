import type {
  ActivityEntry,
  ActivityPage,
  ActivitySession,
  SessionMethod,
  SessionPlatform,
} from '@/lib/serverAccount/activityClient'

export type SignInNoticeKind = 'session' | 'approval' | 'passkey' | 'overflow'

export type NoticeEntryKind =
  | 'session.opened'
  | 'passkey.added'
  | 'device.approved'

export type NoticeDevice = {
  name: string | null
  platform: SessionPlatform | null
}

export type SignInNotice = {
  id: string
  kind: SignInNoticeKind

  entryKind: NoticeEntryKind | null

  at: number
  count: number
  device: NoticeDevice | null

  method: SessionMethod | null

  actor: NoticeDevice | null

  shown: boolean
}

export type SignInMarker = { at: number; ids: string[] }

export type SignInNoticesState = {
  account: string | null
  marker: SignInMarker | null

  readAt: number | null
  notices: SignInNotice[]
}

export const SIGN_IN_NOTICES_INITIAL: SignInNoticesState = {
  account: null,
  marker: null,
  readAt: null,
  notices: [],
}

export const SIGN_IN_NOTICE_THROTTLE_MS = 15 * 60_000

export const SIGN_IN_NOTICE_FAILURE_BACKOFF_MS = 90_000

export const SIGN_IN_MARKER_OVERLAP_MS = 5_000

export const SIGN_IN_MARKER_MAX_IDS = 200

export const SIGN_IN_NOTICE_MAX_PAGES = 5

const APPROVAL_PAIR_MS = 10 * 60_000

export type SignInActivityDeps = {
  isThisDevice: (sessionId: string) => boolean

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

const unseen = (entries: readonly ActivityEntry[], marker: SignInMarker) => {
  const floor = marker.at - SIGN_IN_MARKER_OVERLAP_MS
  const seen = new Set(marker.ids)
  return entries.filter(
    (entry) => entry.createdAt >= floor && !seen.has(entry.id)
  )
}

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

  const kept =
    marker && marker.at >= floor
      ? marker.ids.filter((id) => !recent.includes(id))
      : []
  return { at, ids: [...recent, ...kept].slice(0, SIGN_IN_MARKER_MAX_IDS) }
}

function kindOf(
  entry: ActivityEntry,
  read: readonly ActivityEntry[],
  isThisDevice: SignInActivityDeps['isThisDevice']
): Exclude<SignInNoticeKind, 'overflow'> | null {
  const mine = (session: ActivitySession | null) =>
    session !== null && isThisDevice(session.sessionId)
  switch (entry.kind) {
    case 'session.opened':
      if (mine(entry.session) || mine(entry.actor)) return null
      return entry.method === 'approval' ? 'approval' : 'session'
    case 'passkey.added':
      return mine(entry.session) ? null : 'passkey'
    case 'device.approved': {
      if (mine(entry.session)) return null

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

function joinRow(
  notices: SignInNotice[],
  row: Omit<SignInNotice, 'count'>,
  count: number
) {
  const index = notices.findIndex((notice) => notice.kind === row.kind)
  if (index === -1) notices.push({ ...row, count })
  else notices[index] = { ...row, count: notices[index].count + count }
}

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

export const countBucket = (count: number): '1' | '2_4' | '5_plus' =>
  count <= 1 ? '1' : count < 5 ? '2_4' : '5_plus'

export type SignInNoticeCheckerDeps = {
  account: () => Promise<string | null>

  loadPage: (
    before: string | null
  ) => Promise<ActivityPage & SignInActivityDeps>
  getState: () => SignInNoticesState
  setState: (state: SignInNoticesState) => void
  now: () => number
  onError?: (error: unknown) => void
}

export function createSignInNoticeChecker(deps: SignInNoticeCheckerDeps) {
  let current: { promise: Promise<void>; force: boolean } | null = null
  let forcedNext: Promise<void> | null = null

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

    forcedNext ??= current.promise.then(() => {
      forcedNext = null
      return check({ force: true })
    })
    return forcedNext
  }

  return { check }
}
