import Purchases from 'react-native-purchases'
import { MMKV } from 'react-native-mmkv'
import apis from '@/constants/apis'
import { errorTracking } from '@/lib/errorTracking'
import { logger } from '@/lib/logger'
import { accountSessions, onAccountChange } from '@/lib/serverAccount'
import {
  createRevenueCatLink,
  type RevenueCatLinkOutcome,
  type RevenueCatLinkReason,
} from '@/lib/serverAccount/revenueCatLink'

/**
 * This device's RevenueCat link to its server account (ADR 0029), wired to the
 * session client, RevenueCat's SDK, and device-local MMKV. Imported by
 * `CustomerProvider`, which drives the RevenueCat triggers; a session opening
 * or the account key changing triggers it from here.
 */

let _store: MMKV | null = null
// Device-local, like the session's own MMKV: never synced or backed up.
const store = (): MMKV => (_store ??= new MMKV({ id: 'server-account' }))
const KEY = 'revenuecat-link'

/** Before a paid call, wait at most this long for the link. */
export const PAID_CALL_LINK_WAIT_MS = 5_000

type LinkedListener = (status: {
  supporter: boolean
  expiresAt: number | null
}) => void

const linkedListeners = new Set<LinkedListener>()

/**
 * Calls `listener` with the account's Supporter status each time a link
 * answers, so features that show the server's plan (Scribe AI's limits) can
 * read it again after a purchase or a lapse. Returns the unsubscribe.
 */
export const onRevenueCatLinked = (listener: LinkedListener): (() => void) => {
  linkedListeners.add(listener)
  return () => {
    linkedListeners.delete(listener)
  }
}

export const revenueCatLink = createRevenueCatLink({
  baseUrl: apis.accounts,
  request: (options) => accountSessions.request(options),
  currentAccount: async () => {
    await accountSessions.ready()
    return accountSessions.snapshot()?.accountId ?? null
  },
  openAccount: async () => (await accountSessions.ensure()).accountId,
  appUserId: async () => {
    // Before `Purchases.configure` (or without an SDK key) there's no
    // customer to link.
    if (!(await Purchases.isConfigured())) return null
    return Purchases.getAppUserID()
  },
  storage: {
    get: () => store().getString(KEY) ?? null,
    set: (value) => (value ? store().set(KEY, value) : store().delete(KEY)),
  },
  now: Date.now,
  onOutcome: (outcome: RevenueCatLinkOutcome, reason: RevenueCatLinkReason) => {
    if (outcome.result !== 'skipped' && outcome.result !== 'no_session')
      logger.debug(`[account] revenuecat link (${reason}): ${outcome.result}`)
    if (outcome.result === 'linked')
      for (const listener of linkedListeners)
        listener({ supporter: outcome.supporter, expiresAt: outcome.expiresAt })
  },
  onError: (error) => errorTracking.captureException(error),
})

/**
 * Links when due; never throws. `force` after anything that may have changed
 * the server's answer (a purchase, a restore, an adopted id).
 */
export const ensureRevenueCatLinked = (options: {
  force?: boolean
  reason: RevenueCatLinkReason
}) => revenueCatLink.ensure(options)

/**
 * Before Scribe AI or route planning, which open the session anyway: links when
 * this launch hasn't, waiting at most `PAID_CALL_LINK_WAIT_MS`. The call goes
 * ahead either way; the server answers from what it already has.
 */
export const linkBeforePaidCall = async (): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    revenueCatLink.ensure({ open: true, reason: 'paid_call' }),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, PAID_CALL_LINK_WAIT_MS)
    }),
  ])
  clearTimeout(timer)
}

/**
 * After ww-api refused a paid call as not a Supporter: links again now, even if
 * this device linked today, because the server can have lost the link (each
 * customer keeps at most 5 accounts, ADR 0029) or never got it (a link that
 * failed or took too long). Waits at most `PAID_CALL_LINK_WAIT_MS`. True when
 * the server now answers Supporter, so the call is worth one retry.
 */
export const relinkAfterSupporterRefusal = async (): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const outcome = await Promise.race([
    revenueCatLink.ensure({ force: true, open: true, reason: 'refused' }),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), PAID_CALL_LINK_WAIT_MS)
    }),
  ])
  clearTimeout(timer)
  return outcome?.result === 'linked' && outcome.supporter
}

onAccountChange((change) => {
  // A session just opened: `open` waits for it rather than opening another.
  // After a key change only an existing session counts: after Delete Buddies
  // there's no key to open one for.
  void revenueCatLink.ensure(
    change === 'session_opened'
      ? { open: true, reason: 'session_opened' }
      : { force: true, reason: 'account_changed' }
  )
})
