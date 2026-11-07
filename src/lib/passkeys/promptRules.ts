export type PasskeyPromptReason =
  | 'cloud_sync'
  | 'backup'
  | 'device'
  | 'onboarding'

export const PASSKEY_PROMPT_BACKOFF_MS = 30 * 24 * 60 * 60 * 1000

export const PASSKEY_PROMPT_MAX_NOT_NOWS = 2

export type PasskeyPromptState = {
  account: string | null

  earned: { reason: PasskeyPromptReason; at: number; shown: boolean } | null

  notNowAt: number | null

  notNows: number

  stopped: boolean
}

export const PASSKEY_PROMPT_INITIAL: PasskeyPromptState = {
  account: null,
  earned: null,
  notNowAt: null,
  notNows: 0,
  stopped: false,
}

export type PasskeyOfferFacts = {
  web: boolean

  supported: boolean

  hasAccount: boolean

  passkeyCount: number | null
}

export const accountHasPasskey = (facts: PasskeyOfferFacts): boolean =>
  facts.passkeyCount !== null && facts.passkeyCount > 0

export const passkeyOfferable = (facts: PasskeyOfferFacts): boolean =>
  !facts.web && facts.supported && facts.hasAccount && facts.passkeyCount === 0

const inBackoff = (state: PasskeyPromptState, now: number) =>
  state.notNowAt !== null &&
  now >= state.notNowAt &&
  now - state.notNowAt < PASSKEY_PROMPT_BACKOFF_MS

export const earnsPasskeyPrompt = (
  state: PasskeyPromptState,
  now: number
): boolean => !state.stopped && !inBackoff(state, now)

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
