import Purchases from 'react-native-purchases'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { utf8 } from '@/lib/bytes'
import { getOrCreateAccountId } from '@/lib/account'
import { ownAccountClaim, peerAccountClaims } from '@/lib/accountClaimRegistry'
import type { AccountClaim } from '@/lib/accountClaim'
import {
  ensureRevenueCatLinked,
  serverSupporter,
} from '@/lib/serverAccount/revenueCatLinkRuntime'
import { useServerSupporter } from '@/stores/serverSupporter'
import { useSupporter } from '@/stores/supporterStatus'

/** A RevenueCat id as evidence can show it: never the id itself. */
const fingerprint = (id: string) => bytesToHex(sha256(utf8(id))).slice(0, 12)

const claim = (c: AccountClaim) => ({
  id: fingerprint(c.appUserId),
  entitled: c.entitled,
  claimedAt: c.claimedAt,
})

let revenueCatLast: unknown = null

/**
 * One RevenueCat customer per account (ADR 0040 §7) for the verify harness. Ids
 * come back as 12-hex fingerprints, so reports never carry one. `state()` is
 * synchronous; `readRevenueCat()`, `refreshServer()` and `relink()` put their
 * result in `revenueCat.last`.
 */
export const revenueCatHarness = {
  state: () => {
    let accountId: string | null = null
    try {
      accountId = getOrCreateAccountId()
    } catch {
      // Not readable yet (a locked Keychain).
    }
    const own = ownAccountClaim()
    const server = useServerSupporter.getState()
    return {
      accountId: accountId && fingerprint(accountId),
      ownClaim: own && claim(own),
      peers: peerAccountClaims().map(claim),
      server: {
        active: server.active,
        supporter: server.entry?.supporter ?? null,
        expiresAt: server.entry?.expiresAt ?? null,
        readAt: server.entry?.readAt ?? null,
        forThisAccount:
          server.entry !== null && server.entry.account === server.account,
      },
      mirror: useSupporter.getState().isSupporter,
    }
  },
  /** RevenueCat's own view: its id's fingerprint and active entitlements. */
  readRevenueCat: () => {
    revenueCatLast = null
    void (async () => {
      if (!(await Purchases.isConfigured())) return { configured: false }
      const info = await Purchases.getCustomerInfo()
      return {
        configured: true,
        appUserId: fingerprint(await Purchases.getAppUserID()),
        entitlements: Object.keys(info.entitlements.active),
      }
    })().then(
      (value) => (revenueCatLast = value),
      (error: unknown) => (revenueCatLast = { error: String(error) })
    )
    return 'started'
  },
  /** Reads the server's answer now, as a session opening does. */
  refreshServer: () => {
    revenueCatLast = null
    void serverSupporter
      .refresh({ force: true, reason: 'tools' })
      .then(() => (revenueCatLast = revenueCatHarness.state().server))
    return 'started'
  },
  /** Links again now, so ww-api reads RevenueCat again and answers. */
  relink: () => {
    revenueCatLast = null
    void ensureRevenueCatLinked({ force: true, reason: 'tools' }).then(
      (outcome) => (revenueCatLast = outcome)
    )
    return 'started'
  },
  get last() {
    return revenueCatLast
  },
}
