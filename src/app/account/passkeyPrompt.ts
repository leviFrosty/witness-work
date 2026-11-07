import { Platform } from 'react-native'
import { analytics } from '@/lib/analytics'
import {
  earnsPasskeyPrompt,
  PASSKEY_PROMPT_MAX_NOT_NOWS,
  passkeyPromptForAccount,
  type PasskeyPromptReason,
  type PasskeyPromptState,
} from '@/lib/passkeys/promptRules'
import { accountSessions } from '@/lib/serverAccount'
import { usePreferences } from '@/stores/preferences'

const current = (): PasskeyPromptState =>
  usePreferences.getState().passkeyPrompt

const update = (next: PasskeyPromptState) =>
  usePreferences.setState({ passkeyPrompt: next })

export const passkeyAccountId = (): string | null =>
  accountSessions.snapshot()?.accountId ?? null

export function adoptPasskeyPromptAccount(account: string | null): void {
  const state = current()
  const next = passkeyPromptForAccount(state, account)
  if (next !== state) update(next)
}

const forAccountInUse = (): PasskeyPromptState => {
  adoptPasskeyPromptAccount(passkeyAccountId())
  return current()
}

export function earnPasskeyPrompt(
  reason: PasskeyPromptReason,
  now = Date.now(),
  account = passkeyAccountId()
): void {
  if (Platform.OS === 'web') return
  adoptPasskeyPromptAccount(account)
  const state = current()
  if (state.earned || !earnsPasskeyPrompt(state, now)) return
  update({ ...state, earned: { reason, at: now, shown: false } })
}

export function recordPasskeyPromptShown(): void {
  const { earned } = current()
  if (!earned || earned.shown) return
  update({ ...current(), earned: { ...earned, shown: true } })
  analytics.capture('passkey_prompt_shown', { reason: earned.reason })
}

export function recordPasskeyPromptTapped(): void {
  const { earned } = current()
  if (earned)
    analytics.capture('passkey_prompt_tapped', { reason: earned.reason })
}

export function notNowPasskeyPrompt(now = Date.now()): void {
  const state = forAccountInUse()
  if (!state.earned) return
  const notNows = state.notNows + 1
  const stopped = notNows >= PASSKEY_PROMPT_MAX_NOT_NOWS
  update({ ...state, earned: null, notNowAt: now, notNows, stopped })
  analytics.capture('passkey_prompt_dismissed', {
    reason: state.earned.reason,
    stopped,
    answer: 'not_now',
  })
}

export function dismissPasskeyPrompt(now = Date.now()): void {
  const state = forAccountInUse()
  if (!state.earned) return
  update({ ...state, earned: null, notNowAt: now })
  analytics.capture('passkey_prompt_dismissed', {
    reason: state.earned.reason,
    stopped: false,
    answer: 'dismissed',
  })
}

export function stopPasskeyPrompt(): void {
  const state = forAccountInUse()
  if (state.stopped && !state.earned) return
  update({ ...state, earned: null, stopped: true })
}

export function backOffPasskeyPrompt(now = Date.now()): void {
  update({ ...forAccountInUse(), notNowAt: now })
}
