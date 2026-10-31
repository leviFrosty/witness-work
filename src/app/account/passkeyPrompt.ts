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

/**
 * The gentle prompt to save a passkey, kept in the notifications tray (ADR 0038
 * §9; rules in `@/lib/passkeys/promptRules`). These move its per-device state
 * (`passkeyPrompt`) and report it.
 */

const current = (): PasskeyPromptState =>
  usePreferences.getState().passkeyPrompt

const update = (next: PasskeyPromptState) =>
  usePreferences.setState({ passkeyPrompt: next })

/** The account registered on this phone, if any; reading it asks nothing. */
export const passkeyAccountId = (): string | null =>
  accountSessions.snapshot()?.accountId ?? null

/**
 * `account` is the one in use now: a different one starts over (its own
 * passkeys, stopping and back-off), keeping only the Not Now count.
 */
export function adoptPasskeyPromptAccount(account: string | null): void {
  const state = current()
  const next = passkeyPromptForAccount(state, account)
  if (next !== state) update(next)
}

/**
 * The User just turned on Cloud Sync or backup, set up another device, or
 * finished onboarding on a new install: the prompt waits in the tray, unless
 * it's backed off or stopped. A prompt already waiting keeps its first moment.
 * Finishing onboarding earns it before the new install's account exists
 * (`account` null); the tray lists it once the account does.
 */
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

/** The tray listed the prompt: counted once for each time it was earned. */
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

/** The tray's Not Now: back off 30 days. After the second, it stops for good. */
export function notNowPasskeyPrompt(now = Date.now()): void {
  const state = current()
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

/**
 * The row's X, or Clear All: back off 30 days like a Not Now, but it doesn't
 * count toward stopping for good. Only choosing Not Now says "not this".
 */
export function dismissPasskeyPrompt(now = Date.now()): void {
  const state = current()
  if (!state.earned) return
  update({ ...state, earned: null, notNowAt: now })
  analytics.capture('passkey_prompt_dismissed', {
    reason: state.earned.reason,
    stopped: false,
    answer: 'dismissed',
  })
}

/** The account has a passkey, so the prompt never comes back. */
export function stopPasskeyPrompt(): void {
  const state = current()
  if (state.stopped && !state.earned) return
  update({ ...state, earned: null, stopped: true })
}

/** Onboarding's Not Now: the prompt waits 30 days before a moment can earn it. */
export function backOffPasskeyPrompt(now = Date.now()): void {
  update({ ...current(), notNowAt: now })
}
