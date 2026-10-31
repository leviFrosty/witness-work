import {
  type AccountFile,
  decideAccountAction,
  type AccountAction,
} from '@/lib/accountFile'

/**
 * One RevenueCat customer per account (ADR 0040 §7, ADR 0011): each device
 * publishes its **claim** in its sync payload (`revenueCat`, inside Cloud
 * Sync's encrypted slot), and every device picks the same winner from the
 * claims it can see, so all of an account's devices become one RevenueCat
 * customer. Pure, so it stays unit-testable; `AccountProvider` drives it and
 * `@/lib/account` keeps this device's claim.
 *
 * A claim's id is a RevenueCat app user id: never shown, logged, or reported
 * (ADR 0029 §2).
 */
export type AccountClaim = {
  /** The RevenueCat app user id the device is logged in as (or will be). */
  appUserId: string
  /** Whether the device's RevenueCat customer is a Supporter, as it last saw. */
  entitled: boolean
  /**
   * When the id was first claimed. A device that adopts an id takes the time of
   * the claim it adopted, so the time belongs to the id, not the device.
   */
  claimedAt: number
  /**
   * The server account (`accountFingerprint`) the claim was made under. Only
   * that account's devices take it: the account file and a platform sync's
   * payloads are shared by everyone on the Apple Account or Google Account,
   * whichever server account they're on. Absent from older versions' claims.
   */
  account?: string
}

/** An `accountFingerprint`. */
const ACCOUNT_FINGERPRINT = /^[0-9a-f]{64}$/

/**
 * What ww-api accepts as an app user id; RevenueCat's anonymous ids never
 * match.
 */
const APP_USER_ID = /^[A-Za-z0-9_-]{8,64}$/

/** A peer's claim, or null when it's missing or malformed. */
export const parseAccountClaim = (value: unknown): AccountClaim | null => {
  if (typeof value !== 'object' || value === null) return null
  const { appUserId, entitled, claimedAt, account } = value as Record<
    string,
    unknown
  >
  if (typeof appUserId !== 'string' || !APP_USER_ID.test(appUserId)) return null
  if (typeof entitled !== 'boolean') return null
  if (
    typeof claimedAt !== 'number' ||
    !Number.isSafeInteger(claimedAt) ||
    claimedAt < 0
  )
    return null
  // A claim that doesn't say whose it is can't be told from another account's.
  if (account === undefined) return { appUserId, entitled, claimedAt }
  if (typeof account !== 'string' || !ACCOUNT_FINGERPRINT.test(account))
    return null
  return { appUserId, entitled, claimedAt, account }
}

/** The account file as a claim. Older versions wrote no claim time. */
export const accountFileClaim = (file: AccountFile): AccountClaim => ({
  appUserId: file.accountId,
  entitled: file.entitled,
  claimedAt: file.claimedAt ?? file.updatedAt,
  ...(file.account !== undefined ? { account: file.account } : {}),
})

/**
 * The claim every device that sees the same claims agrees on: entitled beats
 * un-entitled, then the earliest claim, then the smaller id. Claims are taken
 * per id first, so the answer doesn't depend on which device made them: an id
 * is entitled when any of its claims says so, and claimed at its earliest.
 */
export const pickWinningClaim = (
  claims: readonly AccountClaim[]
): AccountClaim | null => {
  const byId = new Map<string, AccountClaim>()
  for (const claim of claims) {
    const seen = byId.get(claim.appUserId)
    byId.set(
      claim.appUserId,
      seen
        ? {
            appUserId: claim.appUserId,
            entitled: seen.entitled || claim.entitled,
            claimedAt: Math.min(seen.claimedAt, claim.claimedAt),
            ...(seen.account !== undefined || claim.account !== undefined
              ? { account: seen.account ?? claim.account }
              : {}),
          }
        : claim
    )
  }
  let winner: AccountClaim | null = null
  for (const claim of byId.values()) {
    if (!winner || beats(claim, winner)) winner = claim
  }
  return winner
}

const beats = (a: AccountClaim, b: AccountClaim): boolean => {
  if (a.entitled !== b.entitled) return a.entitled
  if (a.claimedAt !== b.claimedAt) return a.claimedAt < b.claimedAt
  return a.appUserId < b.appUserId
}

export type AccountReconcileAction =
  | Exclude<AccountAction, { type: 'adopt' }>
  | {
      type: 'adopt'
      accountId: string
      claimedAt: number
      /** Where the winning claim came from, for analytics. */
      source: 'account_file' | 'sync'
      /**
       * The server account the adopted id belongs to: this device's, or the
       * claim's when this device has none. Null when neither says.
       */
      account: string | null
    }

/**
 * ADR 0011's adoption rule, fed by the account file and the sync data alike:
 *
 * - An **un-entitled** device adopts the winning claim when it isn't its own.
 * - An **entitled** device never gives up its id; two entitled ids both stay.
 * - The account file keeps its own handling (`decideAccountAction`): claimed when
 *   missing, claimed over by an entitled device, refreshed when its flag
 *   disagrees. When this device's claim beats the file's, the device takes the
 *   file over, so devices that read only the file follow.
 *
 * `fileRead` is false when there's no account file to consult: no platform
 * transport (Android without Drive, the web), or it couldn't be read.
 *
 * `account` is the server account this device is on (`accountFingerprint`), or
 * null without one. A claim made under another account doesn't count, and an
 * account file another account claimed is left alone: taking it over would have
 * that account's devices take it back, over and over.
 */
export const decideAccountReconcile = (input: {
  own: AccountClaim
  file: AccountFile | null
  fileRead: boolean
  peers: readonly AccountClaim[]
  account?: string | null
}): AccountReconcileAction => {
  const { own, file } = input
  const account = input.account ?? null
  const counts = (claim: AccountClaim) =>
    account === null || claim.account === undefined || claim.account === account
  const fileClaim = input.fileRead && file ? accountFileClaim(file) : null
  const fileRead = input.fileRead && (!fileClaim || counts(fileClaim))
  const peers = input.peers.filter(counts)
  const winner =
    pickWinningClaim([
      own,
      ...(fileRead && fileClaim ? [fileClaim] : []),
      ...peers,
    ]) ?? own
  if (!own.entitled && winner.appUserId !== own.appUserId) {
    return {
      type: 'adopt',
      accountId: winner.appUserId,
      claimedAt: winner.claimedAt,
      source:
        fileRead && fileClaim?.appUserId === winner.appUserId
          ? 'account_file'
          : 'sync',
      account: account ?? winner.account ?? null,
    }
  }
  if (!fileRead) return { type: 'none' }
  const action = decideAccountAction({
    accountId: own.appUserId,
    entitled: own.entitled,
    file,
  })
  // Only reachable when our claim beat the file's: it's un-entitled and loses.
  if (action.type === 'adopt') return { type: 'claim' }
  return action
}
