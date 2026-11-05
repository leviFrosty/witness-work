import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityEntry } from '@/lib/serverAccount/activityClient'
import type { NotificationItem } from '@/types/notifications'

/**
 * The tray rows for new sign-ins elsewhere (ADR 0038 §9): when they read, what
 * they say, where they go, and what they report.
 */

const T0 = Date.UTC(2026, 10, 1, 12)
const OWN = 'own-session-0000000000'

const runtime = vi.hoisted(() => ({
  account: 'acct-1' as string | null,
  entries: [] as ActivityEntry[],
  fail: false,
  appState: new Set<(state: string) => void>(),
  accountListeners: new Set<
    (change: string, detail: { reason?: string }) => void
  >(),
  install: 'same' as 'same' | 'moved' | 'unknown',
  // As `checkInstall` does: answers the same all launch, tells listeners once.
  installTold: false,
  installListeners: new Set<() => void>(),
  navigate: (() => {}) as (screen: string) => void,
}))

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/lib/deviceTimeZone', () => ({ refreshLocalTimeOffset: () => {} }))
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appState.add(listener)
      return { remove: () => runtime.appState.delete(listener) }
    },
  },
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: (screen: string) => runtime.navigate(screen),
  }),
}))
vi.mock('lucide-react-native', () => ({
  History: () => null,
  MonitorSmartphone: () => null,
  UserRoundKey: () => null,
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn() } }))
// The en-US strings themselves, plurals by count.
vi.mock('@/lib/locales', async () => {
  const en = (await import('@/locales/en-US.json'))
    .default as unknown as Record<
    string,
    string | { one: string; other: string }
  >
  return {
    default: {
      t: (key: string, params: Record<string, string | number> = {}) => {
        const value = en[key]
        const text =
          typeof value === 'string'
            ? value
            : params.count === 1
              ? value.one
              : value.other
        return text.replace(
          /%\{(\w+)\}|\{\{(\w+)\}\}/g,
          (_, a?: string, b?: string) => String(params[(a ?? b)!])
        )
      },
    },
  }
})
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: {
    ready: async () => undefined,
    snapshot: () =>
      runtime.account === null ? null : { accountId: runtime.account },
  },
  checkInstall: async () => {
    if (runtime.install === 'moved' && !runtime.installTold) {
      runtime.installTold = true
      runtime.installListeners.forEach((listener) => listener())
    }
    return runtime.install
  },
  onInstallMoved: (listener: () => void) => {
    runtime.installListeners.add(listener)
    return () => runtime.installListeners.delete(listener)
  },
  onAccountChange: (
    listener: (change: string, detail: { reason?: string }) => void
  ) => {
    runtime.accountListeners.add(listener)
    return () => runtime.accountListeners.delete(listener)
  },
}))
vi.mock('@/app/account/accountActivity', () => ({
  loadAccountActivity: vi.fn(async () => {
    if (runtime.fail) throw new Error('offline')
    return {
      entries: [...runtime.entries].sort((a, b) => b.createdAt - a.createdAt),
      nextCursor: null,
      context: {
        isThisDevice: (sessionId: string) => sessionId === OWN,
        readLabel: (sealed: string | null) =>
          sealed ? { name: sealed, platform: 'web', model: '' } : null,
      },
    }
  }),
}))

import { loadAccountActivity } from '@/app/account/accountActivity'
import { SIGN_IN_NOTICES_INITIAL } from '@/app/account/signInNotices'
import { checkSignInNotices } from '@/app/account/signInNoticesRuntime'
import { useSignInNotices } from '@/app/account/signInNoticesStore'
import { useSignInNoticeNotifications } from '@/app/account/useSignInNoticeNotifications'
import { analytics } from '@/lib/analytics'

let nextId = 0
const opened = (
  createdAt: number,
  options: Partial<Pick<ActivityEntry, 'method'>> & {
    session?: string
    device?: string
    kind?: ActivityEntry['kind']
  } = {}
): ActivityEntry => ({
  id: `e${++nextId}`,
  kind: options.kind ?? 'session.opened',
  createdAt,
  session: {
    sessionId: options.session ?? 'other-session-00000000',
    platform: 'web',
    device: options.device ?? 'Chrome on macOS',
  },
  method: options.method ?? null,
  actor: null,
  slotId: null,
})

const seen: NotificationItem[][] = []
let renderer: ReactTestRenderer | null = null
const Probe = () => {
  seen.push(useSignInNoticeNotifications())
  return null
}
const latest = () => seen.at(-1) ?? []
const render = async () => {
  await act(async () => {
    renderer = create(<Probe />)
  })
}
const flush = () => act(async () => {})
/** Away to the background and back. */
const foreground = async () => {
  await act(async () => {
    runtime.appState.forEach((listener) => listener('background'))
    runtime.appState.forEach((listener) => listener('active'))
  })
}
const sessionOpened = async (reason: string) => {
  await act(async () =>
    runtime.accountListeners.forEach((listener) =>
      listener('session_opened', { reason })
    )
  )
  await act(async () => {})
}
const reads = () => vi.mocked(loadAccountActivity).mock.calls.length
const events = (name: string) =>
  vi.mocked(analytics.capture).mock.calls.filter(([event]) => event === name)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: T0, toFake: ['Date'] })
  seen.length = 0
  runtime.account = 'acct-1'
  runtime.entries = [opened(T0 - 60_000)]
  runtime.fail = false
  runtime.install = 'same'
  runtime.installTold = false
  runtime.navigate = vi.fn()
  useSignInNotices.setState(SIGN_IN_NOTICES_INITIAL, true)
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  vi.useRealTimers()
})

describe('useSignInNoticeNotifications', () => {
  it('lists nothing on its first read, then a sign-in from the next', async () => {
    await render()
    expect(reads()).toBe(1)
    expect(latest()).toEqual([])

    runtime.entries.push(opened(T0, { method: 'passkey' }))
    vi.setSystemTime(T0 + 15 * 60_000)
    await foreground()
    expect(reads()).toBe(2)
    const [row] = latest()
    expect(row).toMatchObject({
      kind: 'sign_in',
      at: T0,
      title: 'New sign-in',
      description:
        'Signed in on Chrome on macOS with a passkey. Not you? Sign it out and change your account key.',
    })
    expect(row.actions?.map((action) => action.label)).toEqual([
      'Signed-In Devices',
    ])
  })

  it('waits 15 minutes between foreground reads; Settings → Account forces one', async () => {
    await render()
    await foreground()
    expect(reads()).toBe(1)
    await act(() => checkSignInNotices({ force: true }))
    expect(reads()).toBe(2)
  })

  it('reads when this device’s account changes', async () => {
    await render()
    runtime.account = 'acct-2'
    await act(async () =>
      runtime.accountListeners.forEach((l) => l('session_opened', {}))
    )
    await flush()
    expect(reads()).toBe(2)
    expect(useSignInNotices.getState().account).toBe('acct-2')
  })

  it('stays silent when a read fails', async () => {
    runtime.fail = true
    await render()
    expect(latest()).toEqual([])
    expect(useSignInNotices.getState().marker).toBeNull()
    // A forced read that works ends the backoff for the tests after this one.
    runtime.fail = false
    await act(() => checkSignInNotices({ force: true }))
    expect(useSignInNotices.getState().marker).not.toBeNull()
  })

  it('starts over when this device signs in again after having no session', async () => {
    await render()
    runtime.entries.push(opened(T0 + 1, { device: 'Firefox on Windows' }))
    // Another device's sign-in, then this one's own new session.
    await sessionOpened('new')
    expect(reads()).toBe(2)
    expect(latest()).toEqual([])
    expect(useSignInNotices.getState().marker?.at).toBe(T0 + 1)
  })

  it('keeps its marker when the session only renews', async () => {
    await render()
    runtime.entries.push(opened(T0 + 1, { device: 'Firefox on Windows' }))
    vi.setSystemTime(T0 + 15 * 60_000)
    await sessionOpened('expired')
    expect(latest().map((row) => row.title)).toEqual(['New sign-in'])
  })

  it('keeps its marker when this device renewed its session', async () => {
    await render()
    runtime.entries.push(opened(T0 + 1, { device: 'Firefox on Windows' }))
    vi.setSystemTime(T0 + 15 * 60_000)
    await sessionOpened('renewed')
    expect(latest().map((row) => row.title)).toEqual(['New sign-in'])
  })

  it('drops what a device backup brought from another phone', async () => {
    runtime.install = 'moved'
    useSignInNotices.setState({
      account: 'acct-1',
      marker: { at: T0 - 120_000, ids: [] },
      readAt: null,
      notices: [],
    })
    await render()
    // The old phone's marker would have listed the entry at T0 - 60 s.
    expect(latest()).toEqual([])
    expect(useSignInNotices.getState().marker?.at).toBe(T0 - 60_000)
  })

  it('clears a copied store once, then lists new sign-ins for the rest of the launch', async () => {
    runtime.install = 'moved'
    await render()
    expect(useSignInNotices.getState().marker?.at).toBe(T0 - 60_000)
    const readAt = useSignInNotices.getState().readAt
    expect(readAt).not.toBeNull()
    // checkInstall still says moved; that mustn't start over again.
    runtime.entries.push(opened(T0 + 1, { device: 'Firefox on Windows' }))
    await act(() => checkSignInNotices({ force: true }))
    expect(latest().map((row) => row.title)).toEqual(['New sign-in'])
    // And the throttle holds: a foreground within 15 minutes doesn't read.
    const before = reads()
    await foreground()
    expect(reads()).toBe(before)
  })

  it('lists one row for Account Activity when a read can’t reach the marker', async () => {
    await render()
    vi.mocked(loadAccountActivity).mockImplementation(async (before) => ({
      entries: Array.from({ length: 50 }, (_, i) =>
        opened(T0 + 1_000_000 - i - Number(before ?? 0) * 50)
      ),
      nextCursor: String(Number(before ?? 0) + 1),
      context: {
        isThisDevice: () => false,
        readLabel: (sealed: string | null) =>
          sealed ? { name: sealed, platform: 'web', model: '' } : null,
      },
    }))
    await act(() => checkSignInNotices({ force: true }))
    const [row] = latest()
    expect(row).toMatchObject({
      title: '250+ changes to your account',
      description:
        "Too many to list here. Check Account Activity for sign-ins you don't recognize.",
    })
    act(() => row.actions![0].onPress())
    expect(runtime.navigate).toHaveBeenCalledWith('Account Activity')
    vi.mocked(loadAccountActivity).mockRestore()
  })

  it('collapses a burst, and links a passkey to Passkeys', async () => {
    await render()
    runtime.entries.push(
      opened(T0 + 1, { device: 'Firefox on Windows' }),
      opened(T0 + 2, { device: 'Safari on macOS', method: 'recovery' }),
      opened(T0 + 3, { kind: 'passkey.added', device: 'Safari on macOS' })
    )
    await act(() => checkSignInNotices({ force: true }))
    const rows = latest()
    expect(rows.map((row) => [row.title, row.description])).toEqual([
      [
        'Passkey added',
        'Passkey added on Safari on macOS. Not you? Remove it and change your account key.',
      ],
      [
        '2 new sign-ins',
        'Latest: Signed in on Safari on macOS with a recovery key. Not you? Sign it out and change your account key.',
      ],
    ])
    act(() => rows[0].actions![0].onPress())
    expect(runtime.navigate).toHaveBeenCalledWith('Account Passkeys')
    expect(events('sign_in_notice_tapped')).toEqual([
      ['sign_in_notice_tapped', { kind: 'passkey', count: '1' }],
    ])
    expect(latest()).toHaveLength(1)
  })

  it('reports a row shown once, and dismissing takes it out', async () => {
    await render()
    runtime.entries.push(opened(T0 + 1), opened(T0 + 2), opened(T0 + 3))
    await act(() => checkSignInNotices({ force: true }))
    const [row] = latest()
    act(() => row.onView?.())
    act(() => latest()[0].onView?.())
    expect(events('sign_in_notice_shown')).toEqual([
      ['sign_in_notice_shown', { kind: 'session', count: '2_4' }],
    ])
    act(() => latest()[0].onDismiss?.())
    expect(events('sign_in_notice_dismissed')).toEqual([
      ['sign_in_notice_dismissed', { kind: 'session', count: '2_4' }],
    ])
    expect(latest()).toEqual([])
  })

  it('leaves out this device’s own Sign In Again', async () => {
    await render()
    runtime.entries.push(opened(T0 + 1, { session: OWN, method: 'recovery' }))
    await act(() => checkSignInNotices({ force: true }))
    expect(latest()).toEqual([])
  })
})
