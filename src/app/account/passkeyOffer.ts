import { Platform } from 'react-native'
import { accountKey } from '@/app/account/accountKey'
import { loadPasskeys, phonePasskeySupport } from '@/app/account/passkeys'
import { logger } from '@/lib/logger'
import {
  accountHasPasskey,
  type PasskeyOfferFacts,
  passkeyOfferable,
} from '@/lib/passkeys/promptRules'
import { accountSessions } from '@/lib/serverAccount'

/** `has_passkey`: the account has one, so nothing is ever offered again. */
export type PasskeyOffer = 'offer' | 'has_passkey' | 'unavailable'

const verdict = (facts: PasskeyOfferFacts): PasskeyOffer =>
  passkeyOfferable(facts)
    ? 'offer'
    : accountHasPasskey(facts)
      ? 'has_passkey'
      : 'unavailable'

/**
 * Whether a passkey can be offered on this phone now: it makes them, the
 * account is registered here, and the account has none (ADR 0038 §9).
 * Onboarding's step and the tray's prompt both ask. Reading it never creates an
 * account or an account key, and an account that can't be read gets no offer.
 */
export async function readPasskeyOffer(): Promise<PasskeyOffer> {
  const web = Platform.OS === 'web'
  const facts: PasskeyOfferFacts = {
    web,
    supported: false,
    hasAccount: false,
    passkeyCount: null,
  }
  if (web) return verdict(facts)
  try {
    facts.supported = (await phonePasskeySupport()).passkeys
    if (!facts.supported) return verdict(facts)
    await accountSessions.ready()
    facts.hasAccount =
      accountSessions.snapshot() !== null && (await accountKey.peek()) !== null
    if (!facts.hasAccount) return verdict(facts)
    facts.passkeyCount = (await loadPasskeys()).passkeys.length
  } catch (error) {
    logger.debug('[passkeys] offer check failed', error)
  }
  return verdict(facts)
}
