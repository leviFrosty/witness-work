import Purchases from 'react-native-purchases'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { utf8 } from '@/lib/bytes'
import {
  boundSupporterAccount,
  devStagedAccountFile,
  droppedAccountIds,
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
import { settledRevenueCatId } from '@/lib/settledRevenueCatId'
import type { AccountClaim } from '@/lib/accountClaim'
import {
  ensureRevenueCatLinked,
  serverSupporter,
} from '@/lib/serverAccount/revenueCatLinkRuntime'
import { useServerSupporter } from '@/stores/serverSupporter'
import { useSupporter } from '@/stores/supporterStatus'

const fingerprint = (id: string) => bytesToHex(sha256(utf8(id))).slice(0, 12)

const short = (account: string | null | undefined) =>
  account ? account.slice(0, 12) : null

const claim = (c: AccountClaim) => ({
  id: fingerprint(c.appUserId),
  entitled: c.entitled,
  claimedAt: c.claimedAt,
  account: short(c.account),
})

const accountOf = (account: string | null) =>
  account === 'bound' ? boundSupporterAccount() : account

let revenueCatLast: unknown = null

export const revenueCatHarness = {
  state: () => {
    let accountId: string | null = null
    try {
      accountId = getOrCreateAccountId()
    } catch {}
    const own = ownAccountClaim()
    const settled = settledRevenueCatId()
    const server = useServerSupporter.getState()
    const file = devStagedAccountFile()
    return {
      accountId: accountId && fingerprint(accountId),

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

      dropped: droppedAccountIds().map((entry) => ({
        id: fingerprint(entry.appUserId),
        account: short(entry.account),
      })),

      settled: settled && fingerprint(settled),
      server: {
        active: server.active,
        supporter: server.entry?.supporter ?? null,
        expiresAt: server.entry?.expiresAt ?? null,
        readAt: server.entry?.readAt ?? null,
        forThisAccount:
          server.entry !== null && server.entry.account === server.account,

        account: server.account && server.account.slice(0, 12),
        bound: boundSupporterAccount()?.slice(0, 12) ?? null,
      },
      mirror: useSupporter.getState().isSupporter,
    }
  },

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

  refreshServer: () => {
    revenueCatLast = null
    void serverSupporter
      .refresh({ force: true, reason: 'tools' })
      .then(() => (revenueCatLast = revenueCatHarness.state().server))
    return 'started'
  },

  relink: () => {
    revenueCatLast = null
    void ensureRevenueCatLinked({ force: true, reason: 'tools' }).then(
      (outcome) => (revenueCatLast = outcome)
    )
    return 'started'
  },

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

  boundAccount: () => boundSupporterAccount(),

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
