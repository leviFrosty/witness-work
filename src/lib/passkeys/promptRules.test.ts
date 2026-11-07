import { describe, expect, it } from 'vitest'
import {
  accountHasPasskey,
  earnsPasskeyPrompt,
  PASSKEY_PROMPT_BACKOFF_MS,
  PASSKEY_PROMPT_INITIAL,
  passkeyOfferable,
  type PasskeyOfferFacts,
  passkeyPromptDue,
  passkeyPromptForAccount,
  type PasskeyPromptState,
} from '@/lib/passkeys/promptRules'

const NOW = Date.UTC(2026, 10, 1)
const earned = { reason: 'backup', at: NOW - 1000, shown: false } as const
const state = (
  overrides: Partial<PasskeyPromptState> = {}
): PasskeyPromptState => ({ ...PASSKEY_PROMPT_INITIAL, ...overrides })

const facts = (
  overrides: Partial<PasskeyOfferFacts> = {}
): PasskeyOfferFacts => ({
  web: false,
  supported: true,
  hasAccount: true,
  passkeyCount: 0,
  ...overrides,
})

describe('passkeyOfferable', () => {
  it('offers a passkey to a phone account with none', () => {
    expect(passkeyOfferable(facts())).toBe(true)
  })

  it.each([
    ['on the web', { web: true }],
    ['where passkeys are unsupported', { supported: false }],
    ['before the account exists', { hasAccount: false }],
    ['when the account already has a passkey', { passkeyCount: 1 }],
    ['when the account couldn’t be read', { passkeyCount: null }],
  ])('never offers one %s', (_name, overrides) => {
    expect(passkeyOfferable(facts(overrides))).toBe(false)
  })
})

describe('accountHasPasskey', () => {
  it('is true only for an account read with a passkey', () => {
    expect(accountHasPasskey(facts({ passkeyCount: 1 }))).toBe(true)
    expect(accountHasPasskey(facts({ passkeyCount: 0 }))).toBe(false)
    expect(accountHasPasskey(facts({ passkeyCount: null }))).toBe(false)
  })
})

describe('passkeyPromptDue', () => {
  const due = (s: PasskeyPromptState, onboardingComplete = true, now = NOW) =>
    passkeyPromptDue({ state: s, now, onboardingComplete })

  it('waits for something that earns it', () => {
    expect(due(state())).toBe(false)
    expect(due(state({ earned }))).toBe(true)
  })

  it('waits for onboarding to finish', () => {
    expect(due(state({ earned }), false)).toBe(false)
  })

  it('backs off for 30 days after a Not Now, to the millisecond', () => {
    const notNowAt = NOW - PASSKEY_PROMPT_BACKOFF_MS + 1
    expect(due(state({ earned, notNowAt }))).toBe(false)
    expect(due(state({ earned, notNowAt: notNowAt - 1 }))).toBe(true)
  })

  it('treats a clock set back before the Not Now as outside the back-off', () => {
    const notNowAt = NOW + 1000
    expect(due(state({ earned, notNowAt }))).toBe(true)
    expect(earnsPasskeyPrompt(state({ notNowAt }), NOW)).toBe(true)
  })

  it('never returns once stopped', () => {
    expect(due(state({ earned, stopped: true }))).toBe(false)
    expect(due(state({ earned, stopped: true }), true, NOW * 2)).toBe(false)
  })
})

describe('earnsPasskeyPrompt', () => {
  it('is earned by a moment outside any back-off', () => {
    expect(earnsPasskeyPrompt(state(), NOW)).toBe(true)
    expect(
      earnsPasskeyPrompt(
        state({ notNowAt: NOW - PASSKEY_PROMPT_BACKOFF_MS }),
        NOW
      )
    ).toBe(true)
  })

  it('is not earned during a back-off or after it stopped', () => {
    expect(earnsPasskeyPrompt(state({ notNowAt: NOW - 1000 }), NOW)).toBe(false)
    expect(earnsPasskeyPrompt(state({ stopped: true }), NOW)).toBe(false)
  })
})

describe('passkeyPromptForAccount', () => {
  const used = state({
    account: 'a',
    earned,
    notNowAt: NOW - 1000,
    notNows: 1,
    stopped: true,
  })

  it('keeps the state for the same account', () => {
    expect(passkeyPromptForAccount(used, 'a')).toBe(used)
  })

  it('starts over for a different account, keeping the Not Now count', () => {
    expect(passkeyPromptForAccount(used, 'b')).toEqual({
      ...PASSKEY_PROMPT_INITIAL,
      account: 'b',
      notNows: 1,
    })
  })

  it('adopts the first account without losing what came before it', () => {
    const before = state({ earned })
    expect(passkeyPromptForAccount(before, 'a')).toEqual({
      ...before,
      account: 'a',
    })
  })

  it('does nothing without an account', () => {
    expect(passkeyPromptForAccount(used, null)).toBe(used)
  })
})
