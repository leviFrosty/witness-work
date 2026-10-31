import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PASSKEY_PROMPT_BACKOFF_MS,
  PASSKEY_PROMPT_INITIAL,
  type PasskeyPromptState,
} from '@/lib/passkeys/promptRules'

const runtime = vi.hoisted(() => ({
  prefs: { passkeyPrompt: undefined as unknown as PasskeyPromptState },
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: {
    getState: () => runtime.prefs,
    setState: (partial: object) => Object.assign(runtime.prefs, partial),
  },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: { snapshot: () => ({ accountId: 'a' }) },
}))

import {
  adoptPasskeyPromptAccount,
  backOffPasskeyPrompt,
  dismissPasskeyPrompt,
  earnPasskeyPrompt,
  notNowPasskeyPrompt,
  recordPasskeyPromptShown,
  stopPasskeyPrompt,
} from '@/app/account/passkeyPrompt'
import { analytics } from '@/lib/analytics'

const NOW = Date.UTC(2026, 10, 1)
const state = () => runtime.prefs.passkeyPrompt

beforeEach(() => {
  vi.clearAllMocks()
  runtime.prefs.passkeyPrompt = PASSKEY_PROMPT_INITIAL
})

describe('the gentle passkey prompt', () => {
  it('is earned by turning on Cloud Sync, and keeps its first moment', () => {
    earnPasskeyPrompt('cloud_sync', NOW)
    earnPasskeyPrompt('backup', NOW + 5)
    expect(state().earned).toEqual({
      reason: 'cloud_sync',
      at: NOW,
      shown: false,
    })
  })

  it('reports being shown once for each time it was earned', () => {
    earnPasskeyPrompt('backup', NOW)
    recordPasskeyPromptShown()
    recordPasskeyPromptShown()
    expect(analytics.capture).toHaveBeenCalledTimes(1)
    expect(analytics.capture).toHaveBeenCalledWith('passkey_prompt_shown', {
      reason: 'backup',
    })
  })

  it('backs off 30 days on Not Now, and ignores moments meanwhile', () => {
    earnPasskeyPrompt('device', NOW)
    notNowPasskeyPrompt(NOW)
    expect(state()).toMatchObject({ earned: null, notNowAt: NOW, notNows: 1 })
    earnPasskeyPrompt('backup', NOW + PASSKEY_PROMPT_BACKOFF_MS - 1)
    expect(state().earned).toBeNull()
    earnPasskeyPrompt('backup', NOW + PASSKEY_PROMPT_BACKOFF_MS)
    expect(state().earned).toMatchObject({ reason: 'backup' })
  })

  it('stops for good after the second Not Now', () => {
    earnPasskeyPrompt('device', NOW)
    notNowPasskeyPrompt(NOW)
    const later = NOW + PASSKEY_PROMPT_BACKOFF_MS
    earnPasskeyPrompt('device', later)
    notNowPasskeyPrompt(later)
    expect(state().stopped).toBe(true)
    earnPasskeyPrompt('device', later * 2)
    expect(state().earned).toBeNull()
    expect(analytics.capture).toHaveBeenLastCalledWith(
      'passkey_prompt_dismissed',
      { reason: 'device', stopped: true, answer: 'not_now' }
    )
  })

  it('stops for good once the account has a passkey', () => {
    earnPasskeyPrompt('backup', NOW)
    stopPasskeyPrompt()
    expect(state()).toMatchObject({ earned: null, stopped: true })
    earnPasskeyPrompt('backup', NOW * 2)
    expect(state().earned).toBeNull()
  })

  it('backs off after onboarding’s Not Now without counting it', () => {
    backOffPasskeyPrompt(NOW)
    expect(state()).toMatchObject({ notNowAt: NOW, notNows: 0, stopped: false })
    earnPasskeyPrompt('cloud_sync', NOW + 1000)
    expect(state().earned).toBeNull()
  })

  it('backs off on a dismissal without counting it toward stopping', () => {
    for (let i = 0; i < 3; i++) {
      const at = NOW + i * PASSKEY_PROMPT_BACKOFF_MS
      earnPasskeyPrompt('backup', at)
      dismissPasskeyPrompt(at)
      expect(state()).toMatchObject({
        earned: null,
        notNowAt: at,
        notNows: 0,
        stopped: false,
      })
    }
    expect(analytics.capture).toHaveBeenLastCalledWith(
      'passkey_prompt_dismissed',
      { reason: 'backup', stopped: false, answer: 'dismissed' }
    )
  })

  it('is earned by finishing onboarding, before any account exists', () => {
    earnPasskeyPrompt('onboarding', NOW, null)
    expect(state()).toMatchObject({
      account: null,
      earned: { reason: 'onboarding', at: NOW },
    })
  })

  it('knows the account a moment happened under', () => {
    earnPasskeyPrompt('backup', NOW)
    expect(state().account).toBe('a')
  })

  it('starts over for a different account but keeps the Not Now count', () => {
    earnPasskeyPrompt('device', NOW)
    notNowPasskeyPrompt(NOW)
    earnPasskeyPrompt('device', NOW + PASSKEY_PROMPT_BACKOFF_MS)
    stopPasskeyPrompt()
    adoptPasskeyPromptAccount('b')
    expect(state()).toEqual({
      ...PASSKEY_PROMPT_INITIAL,
      account: 'b',
      notNows: 1,
    })
    earnPasskeyPrompt('device', NOW + 1, 'b')
    expect(state().earned).toMatchObject({ reason: 'device' })
  })
})
