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
}

/**
 * What ww-api accepts as an app user id; RevenueCat's anonymous ids never
 * match.
 */
const APP_USER_ID = /^[A-Za-z0-9_-]{8,64}$/

/** A peer's claim, or null when it's missing or malformed. */
export const parseAccountClaim = (value: unknown): AccountClaim | null => {
  if (typeof value !== 'object' || value === null) return null
  const { appUserId, entitled, claimedAt } = value as Record<string, unknown>
  if (typeof appUserId !== 'string' || !APP_USER_ID.test(appUserId)) return null
  if (typeof entitled !== 'boolean') return null
  if (
    typeof claimedAt !== 'number' ||
    !Number.isSafeInteger(claimedAt) ||
    claimedAt < 0
  )
    return null
  return { appUserId, entitled, claimedAt }
}

/** The account file as a claim. Older versions wrote no claim time. */
export const accountFileClaim = (file: AccountFile): AccountClaim => ({
  appUserId: file.accountId,
  entitled: file.entitled,
  claimedAt: file.claimedAt ?? file.updatedAt,
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
 */
export const decideAccountReconcile = (input: {
  own: AccountClaim
  file: AccountFile | null
  fileRead: boolean
  peers: readonly AccountClaim[]
}): AccountReconcileAction => {
  const { own, file, fileRead, peers } = input
  const fileClaim = fileRead && file ? accountFileClaim(file) : null
  const winner =
    pickWinningClaim([own, ...(fileClaim ? [fileClaim] : []), ...peers]) ?? own
  if (!own.entitled && winner.appUserId !== own.appUserId) {
    return {
      type: 'adopt',
      accountId: winner.appUserId,
      claimedAt: winner.claimedAt,
      source:
        fileClaim?.appUserId === winner.appUserId ? 'account_file' : 'sync',
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
