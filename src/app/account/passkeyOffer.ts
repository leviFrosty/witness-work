import { Platform } from 'react-native'
import { accountKey } from '@/app/account/accountKey'
import { loadPasskeys, accountPasskeySupport } from '@/app/account/passkeys'
import { logger } from '@/lib/logger'
import {
  accountHasPasskey,
  type PasskeyOfferFacts,
  passkeyOfferable,
} from '@/lib/passkeys/promptRules'
import { accountSessions } from '@/lib/serverAccount'

export type PasskeyOffer = 'offer' | 'has_passkey' | 'unavailable'

const verdict = (facts: PasskeyOfferFacts): PasskeyOffer =>
  passkeyOfferable(facts)
    ? 'offer'
    : accountHasPasskey(facts)
      ? 'has_passkey'
      : 'unavailable'

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
    facts.supported = (await accountPasskeySupport()).passkeys
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
