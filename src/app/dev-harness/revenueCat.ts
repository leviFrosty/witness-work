import Purchases from 'react-native-purchases'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { utf8 } from '@/lib/bytes'
import {
  boundSupporterAccount,
  devStagedAccountFile,
  getOrCreateAccountId,
  stageDevAccountFile,
} from '@/lib/account'
import {
  revenueCatIsOwn,
  setDevRevenueCatLogInsFail,
} from '@/lib/revenueCatIdentity'
import { simulateOffline } from '@/lib/http/online'
import {
  ownAccountClaim,
  peerAccountClaims,
  setPeerAccountClaims,
} from '@/lib/accountClaimRegistry'
import type { AccountClaim } from '@/lib/accountClaim'
import {
  ensureRevenueCatLinked,
  serverSupporter,
} from '@/lib/serverAccount/revenueCatLinkRuntime'
import { useServerSupporter } from '@/stores/serverSupporter'
import { useSupporter } from '@/stores/supporterStatus'

/** A RevenueCat id as evidence can show it: never the id itself. */
const fingerprint = (id: string) => bytesToHex(sha256(utf8(id))).slice(0, 12)

/** A server account fingerprint as evidence shows it. */
const short = (account: string | null | undefined) =>
  account ? account.slice(0, 12) : null

const claim = (c: AccountClaim) => ({
  id: fingerprint(c.appUserId),
  entitled: c.entitled,
  claimedAt: c.claimedAt,
  account: short(c.account),
})

/** `'bound'` is the account bound now; null says none. */
const accountOf = (account: string | null) =>
  account === 'bound' ? boundSupporterAccount() : account

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
    const file = devStagedAccountFile()
    return {
      accountId: accountId && fingerprint(accountId),
      /** RevenueCat is logged in as `accountId` (`revenueCatIdentity`). */
      revenueCatIsOwn: revenueCatIsOwn(),
      accountFile:
        file === undefined
          ? 'not staged'
          : file && {
              id: fingerprint(file.accountId),
              entitled: file.entitled,
              account: short(file.account),
            },
      ownClaim: own && claim(own),
      peers: peerAccountClaims().map(claim),
      server: {
        active: server.active,
        supporter: server.entry?.supporter ?? null,
        expiresAt: server.entry?.expiresAt ?? null,
        readAt: server.entry?.readAt ?? null,
        forThisAccount:
          server.entry !== null && server.entry.account === server.account,
        /** The session's account (fingerprint), and the one bound before. */
        account: server.account && server.account.slice(0, 12),
        bound: boundSupporterAccount()?.slice(0, 12) ?? null,
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
  /**
   * Another of the account's devices published `appUserId` in the sync data
   * (ADR 0040 §7), as a pull would read it, made under `account` (an
   * `accountFingerprint`, `'bound'` for this device's, or null for an older
   * version's untagged claim).
   */
  peerClaim: (
    appUserId: string,
    entitled: boolean,
    account: string | null = 'bound'
  ) => {
    const tag = accountOf(account)
    setPeerAccountClaims([
      tag
        ? { appUserId, entitled, claimedAt: 0, account: tag }
        : { appUserId, entitled, claimedAt: 0 },
    ])
    return 'ok'
  },
  /**
   * The Apple Account's account file (ADR 0011), which simulators can't read
   * from iCloud: claims `appUserId` under `account` (as `peerClaim`). `null`
   * stages no file; `unstage()` reads the transport again.
   */
  accountFile: (
    appUserId: string | null,
    entitled = true,
    account: string | null = 'bound'
  ) => {
    const tag = accountOf(account)
    stageDevAccountFile(
      appUserId
        ? {
            v: 1,
            accountId: appUserId,
            entitled,
            updatedAt: Date.now(),
            claimedAt: 0,
            ...(tag ? { account: tag } : {}),
          }
        : null
    )
    return 'ok'
  },
  unstageAccountFile: () => {
    stageDevAccountFile(undefined)
    return 'ok'
  },
  /**
   * The bound account's full fingerprint, to stage its claims after a
   * reinstall.
   */
  boundAccount: () => boundSupporterAccount(),
  /**
   * RevenueCat can't be reached (`true`): its logins fail as offline, while
   * ww-api still answers. False lets them through and reports the connection
   * coming back, which retries.
   */
  revenueCatUnreachable: (unreachable: boolean) => {
    setDevRevenueCatLogInsFail(unreachable)
    if (!unreachable) {
      simulateOffline(true)
      simulateOffline(false)
    }
    return 'ok'
  },
  get last() {
    return revenueCatLast
  },
}
