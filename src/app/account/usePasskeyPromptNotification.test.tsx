import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PASSKEY_PROMPT_BACKOFF_MS,
  PASSKEY_PROMPT_INITIAL,
  type PasskeyPromptState,
} from '@/lib/passkeys/promptRules'
import type { NotificationItem } from '@/types/notifications'

const NOW = Date.UTC(2026, 10, 1)

const runtime = vi.hoisted(() => ({
  prefs: {
    onboardingComplete: true,
    passkeyPrompt: undefined as unknown as PasskeyPromptState,
  },
  offer: 'offer' as 'offer' | 'has_passkey' | 'unavailable',
  added: true,
  account: 'acct-1' as string | null,
  accountListeners: new Set<(change: string) => void>(),
  reconnectListeners: new Set<() => void>(),
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('lucide-react-native', () => ({ UserRoundKey: () => null }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/stores/preferences', () => {
  const listeners = new Set<() => void>()
  return {
    usePreferences: Object.assign(
      (select: (state: typeof runtime.prefs) => unknown) =>
        select(runtime.prefs),
      {
        getState: () => runtime.prefs,
        setState: (partial: object) => {
          Object.assign(runtime.prefs, partial)
          listeners.forEach((listener) => listener())
        },
      }
    ),
  }
})
vi.mock('@/app/account/passkeyOffer', () => ({
  readPasskeyOffer: vi.fn(async () => runtime.offer),
}))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: {
    snapshot: () =>
      runtime.account === null ? null : { accountId: runtime.account },
  },
  onAccountChange: (listener: (change: string) => void) => {
    runtime.accountListeners.add(listener)
    return () => runtime.accountListeners.delete(listener)
  },
}))
vi.mock('@/lib/http/online', () => ({
  addReconnectListener: (listener: () => void) => {
    runtime.reconnectListeners.add(listener)
    return { remove: () => runtime.reconnectListeners.delete(listener) }
  },
}))
vi.mock(
  '@/features/settings/components/account/passkeys/passkeyActions',
  () => ({
    // The real one stops the prompt itself when a passkey was added.
    addPasskeyWithToasts: vi.fn(async () => {
      if (runtime.added) stopPasskeyPrompt()
      return runtime.added
    }),
  })
)

import { readPasskeyOffer } from '@/app/account/passkeyOffer'
import { stopPasskeyPrompt } from '@/app/account/passkeyPrompt'
import {
  forgetPasskeyOfferCheck,
  recheckPasskeyOffer,
  usePasskeyPromptNotification,
} from '@/app/account/usePasskeyPromptNotification'
import { addPasskeyWithToasts } from '@/features/settings/components/account/passkeys/passkeyActions'
import { analytics } from '@/lib/analytics'

const earned = { reason: 'backup', at: NOW - 1000, shown: false } as const
const seen: (NotificationItem | null)[] = []
let renderer: ReactTestRenderer | null = null
const Probe = ({ now = NOW }: { now?: number }) => {
  seen.push(usePasskeyPromptNotification(now))
  return null
}
const latest = () => seen.at(-1) ?? null
const render = async (now = NOW) => {
  await act(async () => {
    renderer = create(<Probe now={now} />)
  })
}
const rerender = async (now = NOW) => {
  await act(async () => renderer!.update(<Probe now={now} />))
}
const checks = () => vi.mocked(readPasskeyOffer).mock.calls.length

beforeEach(() => {
  vi.clearAllMocks()
  seen.length = 0
  runtime.offer = 'offer'
  runtime.added = true
  runtime.account = 'acct-1'
  runtime.accountListeners.clear()
  runtime.reconnectListeners.clear()
  forgetPasskeyOfferCheck()
  runtime.prefs.onboardingComplete = true
  runtime.prefs.passkeyPrompt = { ...PASSKEY_PROMPT_INITIAL, earned }
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

describe('usePasskeyPromptNotification', () => {
  it('lists Add a Passkey and Not Now once it was earned', async () => {
    await render()
    expect(latest()).toMatchObject({
      id: `passkey_prompt:${earned.at}`,
      kind: 'passkey',
      title: 'passkeyPrompt_title',
    })
    expect(latest()!.actions!.map((a) => [a.label, a.inPlace])).toEqual([
      ['passkeys_add', true],
      ['notNow', true],
    ])
  })

  it('lists nothing before something earned it', async () => {
    runtime.prefs.passkeyPrompt = PASSKEY_PROMPT_INITIAL
    await render()
    expect(latest()).toBeNull()
  })

  it('lists nothing before onboarding is done', async () => {
    runtime.prefs.onboardingComplete = false
    await render()
    expect(latest()).toBeNull()
  })

  it('lists nothing during the back-off after a Not Now', async () => {
    runtime.prefs.passkeyPrompt = {
      ...PASSKEY_PROMPT_INITIAL,
      earned,
      notNowAt: NOW - PASSKEY_PROMPT_BACKOFF_MS + 1,
    }
    await render()
    expect(latest()).toBeNull()
  })

  it('lists nothing when the account can’t be read', async () => {
    runtime.offer = 'unavailable'
    await render()
    expect(latest()).toBeNull()
    expect(runtime.prefs.passkeyPrompt.stopped).toBe(false)
  })

  it('stops for good when the account already has a passkey', async () => {
    runtime.offer = 'has_passkey'
    await render()
    expect(latest()).toBeNull()
    expect(runtime.prefs.passkeyPrompt).toMatchObject({
      earned: null,
      stopped: true,
    })
  })

  it('counts a view once and Add a Passkey stops it for good', async () => {
    await render()
    latest()!.onView!()
    latest()!.onView!()
    expect(
      vi
        .mocked(analytics.capture)
        .mock.calls.filter(([name]) => name === 'passkey_prompt_shown')
    ).toHaveLength(1)
    await act(async () => latest()!.actions![0].onPress())
    expect(addPasskeyWithToasts).toHaveBeenCalledWith({
      count: 0,
      support: null,
      source: 'prompt',
    })
    expect(analytics.capture).toHaveBeenCalledWith('passkey_prompt_tapped', {
      reason: 'backup',
    })
    expect(runtime.prefs.passkeyPrompt.stopped).toBe(true)
    await rerender()
    expect(latest()).toBeNull()
  })

  it('shows the row as busy while a passkey is being added', async () => {
    let finish: (added: boolean) => void = () => undefined
    vi.mocked(addPasskeyWithToasts).mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finish = resolve))
    )
    await render()
    await act(async () => latest()!.actions![0].onPress())
    expect(latest()!.actions![0].label).toBe('passkeyPrompt_adding')
    await act(async () => latest()!.actions![0].onPress())
    expect(addPasskeyWithToasts).toHaveBeenCalledTimes(1)
    await act(async () => finish(false))
    expect(latest()!.actions![0].label).toBe('passkeys_add')
  })

  it('drops the row right away when a passkey is added elsewhere', async () => {
    await render()
    expect(latest()).not.toBeNull()
    act(() => stopPasskeyPrompt())
    await rerender()
    expect(latest()).toBeNull()
  })

  it('keeps the prompt when adding fails or is cancelled', async () => {
    runtime.added = false
    await render()
    await act(async () => latest()!.actions![0].onPress())
    expect(runtime.prefs.passkeyPrompt.earned).not.toBeNull()
    expect(runtime.prefs.passkeyPrompt.stopped).toBe(false)
  })

  it('counts Not Now, but not dismissing the row or Clear All', async () => {
    await render()
    latest()!.actions![1].onPress()
    expect(runtime.prefs.passkeyPrompt).toMatchObject({
      earned: null,
      notNows: 1,
    })
    expect(analytics.capture).toHaveBeenCalledWith('passkey_prompt_dismissed', {
      reason: 'backup',
      stopped: false,
      answer: 'not_now',
    })
    runtime.prefs.passkeyPrompt = { ...PASSKEY_PROMPT_INITIAL, earned }
    await rerender()
    latest()!.onDismiss!()
    expect(runtime.prefs.passkeyPrompt).toMatchObject({
      earned: null,
      notNows: 0,
    })
    expect(runtime.prefs.passkeyPrompt.notNowAt).not.toBeNull()
  })

  describe('checking the account', () => {
    it('doesn’t ask again when the bell mounts again soon', async () => {
      await render()
      expect(checks()).toBe(1)
      act(() => renderer!.unmount())
      await render()
      expect(checks()).toBe(1)
      expect(latest()).not.toBeNull()
    })

    it('asks again once the answer is old', async () => {
      await render()
      act(() => renderer!.unmount())
      vi.useFakeTimers({ now: NOW + 60 * 60 * 1000, toFake: ['Date'] })
      try {
        await render()
        expect(checks()).toBe(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('retries a failed check when the connection comes back', async () => {
      runtime.offer = 'unavailable'
      await render()
      expect(latest()).toBeNull()
      runtime.offer = 'offer'
      await act(async () => runtime.reconnectListeners.forEach((l) => l()))
      expect(checks()).toBe(2)
      expect(latest()).not.toBeNull()
    })

    it('retries a failed check when the tray opens', async () => {
      runtime.offer = 'unavailable'
      await render()
      runtime.offer = 'offer'
      await act(async () => recheckPasskeyOffer())
      expect(checks()).toBe(2)
      expect(latest()).not.toBeNull()
    })

    it('doesn’t ask again on opening the tray after a good answer', async () => {
      await render()
      await act(async () => recheckPasskeyOffer())
      expect(checks()).toBe(1)
    })

    it('waits for the account to exist, then checks again', async () => {
      runtime.account = null
      runtime.offer = 'unavailable'
      await render()
      expect(latest()).toBeNull()
      runtime.account = 'acct-1'
      runtime.offer = 'offer'
      await act(async () =>
        runtime.accountListeners.forEach((l) => l('session_opened'))
      )
      expect(latest()).not.toBeNull()
      expect(runtime.prefs.passkeyPrompt.account).toBe('acct-1')
    })
  })

  it('starts over for a different account but keeps the Not Now count', async () => {
    runtime.prefs.passkeyPrompt = {
      ...PASSKEY_PROMPT_INITIAL,
      account: 'acct-1',
      earned,
      notNows: 1,
      notNowAt: NOW - 1000,
      stopped: true,
    }
    runtime.account = 'acct-2'
    await render()
    expect(runtime.prefs.passkeyPrompt).toEqual({
      ...PASSKEY_PROMPT_INITIAL,
      account: 'acct-2',
      notNows: 1,
    })
    expect(latest()).toBeNull()
  })
})
