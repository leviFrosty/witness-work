/**
 * When phones ask the User to save a passkey (ADR 0038 §9, passkeys-protocol
 * "Passkeys on phones"). Onboarding offers it once, and one gentle prompt later
 * reaches people who skipped it, or never saw the step: "after turning on Cloud
 * Sync or backup, setting up another device, or finishing onboarding on a new
 * install. It backs off for 30 days and is never forced." Everything works
 * without a passkey.
 */

/** What earns the gentle prompt: the User just did one of these. */
export type PasskeyPromptReason =
  | 'cloud_sync'
  | 'backup'
  | 'device'
  /** Finished onboarding on a new install, whose account exists only now. */
  | 'onboarding'

/** Not Now backs the prompt off this long (onboarding's and the tray's). */
export const PASSKEY_PROMPT_BACKOFF_MS = 30 * 24 * 60 * 60 * 1000

/**
 * The contract doesn't say when the prompt stops for good. The least pushy
 * reading: after this many Not Nows to the tray's prompt, it never returns.
 * Dismissing the row (its X, or Clear All) backs it off without counting.
 */
export const PASSKEY_PROMPT_MAX_NOT_NOWS = 2

export type PasskeyPromptState = {
  /**
   * The account this state is about; null until one is known. A different
   * account starts over (`passkeyPromptForAccount`).
   */
  account: string | null
  /** What last earned the prompt, until it's answered; null when none waits. */
  earned: { reason: PasskeyPromptReason; at: number; shown: boolean } | null
  /** The last Not Now or dismissal, in onboarding or the tray (epoch ms). */
  notNowAt: number | null
  /** Not Nows to the tray's prompt; onboarding's and dismissals don't count. */
  notNows: number
  /** For good: the account has a passkey, or the User said Not Now enough. */
  stopped: boolean
}

export const PASSKEY_PROMPT_INITIAL: PasskeyPromptState = {
  account: null,
  earned: null,
  notNowAt: null,
  notNows: 0,
  stopped: false,
}

/** What this device knows about offering a passkey right now. */
export type PasskeyOfferFacts = {
  web: boolean
  /** This phone can make passkeys (`passkeySupport`). */
  supported: boolean
  /** A server account is registered here; asking never creates one. */
  hasAccount: boolean
  /** Passkeys on the account; null when it couldn't be read. */
  passkeyCount: number | null
}

/** The account is known to have a passkey already. */
export const accountHasPasskey = (facts: PasskeyOfferFacts): boolean =>
  facts.passkeyCount !== null && facts.passkeyCount > 0

/**
 * Whether a passkey can be offered at all: on a phone that makes them, for an
 * account that exists and has none. An account that couldn't be read gets no
 * offer.
 */
export const passkeyOfferable = (facts: PasskeyOfferFacts): boolean =>
  !facts.web && facts.supported && facts.hasAccount && facts.passkeyCount === 0

/** A clock set back before the Not Now is outside the back-off, not inside. */
const inBackoff = (state: PasskeyPromptState, now: number) =>
  state.notNowAt !== null &&
  now >= state.notNowAt &&
  now - state.notNowAt < PASSKEY_PROMPT_BACKOFF_MS

/**
 * Whether doing `reason` now earns the prompt. During a back-off, or once it
 * stopped, it doesn't: the prompt waits for the next such moment after the 30
 * days, never for one that passed while it was backed off.
 */
export const earnsPasskeyPrompt = (
  state: PasskeyPromptState,
  now: number
): boolean => !state.stopped && !inBackoff(state, now)

/**
 * Whether the tray lists the prompt: it was earned, onboarding is done, and it
 * isn't backed off or stopped. The account's passkeys are checked separately
 * (`passkeyOfferable`).
 */
export const passkeyPromptDue = ({
  state,
  now,
  onboardingComplete,
}: {
  state: PasskeyPromptState
  now: number
  onboardingComplete: boolean
}): boolean =>
  onboardingComplete && state.earned !== null && earnsPasskeyPrompt(state, now)

/**
 * The state once `account` is the one in use. A new account starts over: its
 * passkeys, stopping and back-off are its own. The Not Now count stays, as it
 * is the device's patience, not the account's. The first account seen (state
 * from before one existed, like finishing onboarding) is adopted as is.
 */
export const passkeyPromptForAccount = (
  state: PasskeyPromptState,
  account: string | null
): PasskeyPromptState => {
  const known = state.account ?? null
  if (account === null || account === known) return state
  if (known === null) return { ...state, account }
  return {
    ...PASSKEY_PROMPT_INITIAL,
    account,
    notNows: state.notNows,
  }
}
