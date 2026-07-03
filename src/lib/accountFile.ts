/**
 * Account model (ADR 0011): one person = one Apple ID = one **account id**
 * shared by all of their devices, with no sign-in. Each device starts life with
 * its own Keychain install id (ADR 0007); the account file in the iCloud
 * ubiquity container is how devices agree on a single id, so RevenueCat sees
 * them as one customer and Supporter status (and its lapse) propagates
 * automatically.
 *
 * This module is the pure data layer — file payload shape, parser, and the
 * reconcile decision — kept free of native imports so it stays unit-testable.
 * The effectful layer (Keychain/MMKV/iCloud IO) lives in `@/lib/account`.
 */

/**
 * The account file lives inside the sync-file namespace (`witness-work*.json`)
 * on purpose: it's the only namespace the iCloud bridge will write, and the
 * only pattern its metadata query watches — so remote edits to this file fire
 * the same `onRemoteChange` event the app already listens to. The data-sync
 * engine must skip it when merging (see `isAccountFilename` checks in
 * `iCloudSync.ts`).
 */
export const ACCOUNT_FILENAME = 'witness-work-account.json'

/**
 * Matches the canonical account file AND any iCloud conflict duplicates
 * (`witness-work-account 2.json`, …) so both the sync engine's skip and the
 * account reader's duplicate cleanup cover the whole family.
 */
export const isAccountFilename = (filename: string): boolean =>
  filename.startsWith('witness-work-account')

export type AccountFile = {
  v: 1
  /**
   * The account id every device on this Apple ID should identify with — used as
   * both the RevenueCat app user id and the ww-proxy identity.
   */
  accountId: string
  /**
   * Whether the writing device held an active Supporter entitlement under
   * `accountId` at write time. Consulted for two things: breaking the
   * (vanishingly rare) entitled-vs-entitled tie without a network call, and
   * detecting cross-device entitlement changes (see `refresh` action). A stale
   * value self-corrects — see `decideAccountAction`.
   */
  entitled: boolean
  updatedAt: number
  deviceName?: string
}

export const parseAccountFile = (json: string): AccountFile | null => {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return null
    const candidate = parsed as Record<string, unknown>
    if (candidate.v !== 1) return null
    if (typeof candidate.accountId !== 'string' || !candidate.accountId) {
      return null
    }
    if (typeof candidate.entitled !== 'boolean') return null
    if (typeof candidate.updatedAt !== 'number') return null
    return candidate as AccountFile
  } catch {
    return null
  }
}

export type AccountAction =
  /** Write (or overwrite) the account file with this device's id + flag. */
  | { type: 'claim' }
  /** Log in to RevenueCat as the file's id and persist it as ours. */
  | { type: 'adopt'; accountId: string }
  /**
   * The file is ours but its entitled flag disagrees with our cached
   * CustomerInfo — another device changed entitlement state (purchase or
   * lapse). Re-fetch CustomerInfo, then correct the flag if the file was the
   * stale side.
   */
  | { type: 'refresh' }
  | { type: 'none' }

/**
 * The whole cross-device agreement in one pure function. Invariants that make
 * it converge without ping-ponging writes:
 *
 * - An **entitled** device never gives up its id (adopting could silently drop a
 *   live entitlement). It claims over an un-entitled file and leaves an
 *   entitled foreign claim alone — if two devices are genuinely entitled under
 *   different ids (two independent grants, e.g. a Lifetime Supporter promo plus
 *   a subscription), both stay Supporters under their own ids and the file
 *   settles on whichever claimed first.
 * - An **un-entitled** device always adopts a foreign claim, entitled or not.
 *   Adopting a lapsed id is fine: the flag mismatch surfaces as `refresh` on
 *   the next pass and the file gets corrected, at which point a genuinely
 *   entitled device (if any) claims over it.
 * - Flag disagreement on our own id triggers `refresh`, not a blind rewrite — the
 *   file may be _ahead_ of our cached CustomerInfo (the other device just
 *   purchased or lapsed), so we re-fetch before deciding who was stale.
 */
export const decideAccountAction = (input: {
  /** This device's current account id (adopted shared id ?? install id). */
  accountId: string
  /** Active Supporter entitlement under `accountId`, per cached CustomerInfo. */
  entitled: boolean
  file: AccountFile | null
}): AccountAction => {
  const { accountId, entitled, file } = input
  if (!file) return { type: 'claim' }
  if (file.accountId === accountId) {
    if (file.entitled !== entitled) return { type: 'refresh' }
    return { type: 'none' }
  }
  if (!entitled) return { type: 'adopt', accountId: file.accountId }
  if (!file.entitled) return { type: 'claim' }
  return { type: 'none' }
}
