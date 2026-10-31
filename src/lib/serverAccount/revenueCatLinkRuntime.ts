import Purchases from 'react-native-purchases'
import { MMKV } from 'react-native-mmkv'
import apis from '@/constants/apis'
import { errorTracking } from '@/lib/errorTracking'
import { logger } from '@/lib/logger'
import {
  accountSessions,
  currentSessionAccount,
  onAccountChange,
} from '@/lib/serverAccount'
import {
  createRevenueCatLink,
  type RevenueCatLinkOutcome,
  type RevenueCatLinkReason,
} from '@/lib/serverAccount/revenueCatLink'
import {
  confirmSupporterAccount,
  createServerSupporter,
} from '@/lib/serverAccount/serverSupporter'
import { addForegroundListener } from '@/lib/appLifecycle'
import {
  bindSupporterAccount,
  boundSupporterAccount,
  clearAdoptedAccountId,
  getOrCreateAccountId,
} from '@/lib/account'
import {
  setOwnAccountClaim,
  setPeerAccountClaims,
} from '@/lib/accountClaimRegistry'
import {
  setServerSupporterAccount,
  setServerSupporterEntry,
  useServerSupporter,
} from '@/stores/serverSupporter'
import { useSupporter } from '@/stores/supporterStatus'

/**
 * This device's RevenueCat link to its server account (ADR 0029), wired to the
 * session client, RevenueCat's SDK, and device-local MMKV. Imported by
 * `CustomerProvider`, which drives the RevenueCat triggers; a session opening
 * or the account key changing triggers it from here. Also keeps the server's
 * answer for `useIsSupporter`'s fallback (`serverSupporter`, ADR 0040 §7).
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
  /** The account it answered for. */
  accountId: string
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

const accountSwitchedListeners = new Set<() => void>()

/**
 * Calls `listener` once a session confirms another server account than the one
 * bound here (the first one too), after the previous account's Supporter state
 * is dropped: the RevenueCat id adopted for it is gone, so `AccountProvider`
 * logs in again and takes only this account's claims. Returns the unsubscribe.
 */
export const onSupporterAccountSwitched = (
  listener: () => void
): (() => void) => {
  accountSwitchedListeners.add(listener)
  return () => {
    accountSwitchedListeners.delete(listener)
  }
}

/**
 * Another account signed in: nothing the previous one left says Supporter here.
 * Its RevenueCat id travelled in its sync data (ADR 0040 §7), so this device
 * goes back to its own until the new account's claims (or the account file, ADR
 * 0011) say otherwise.
 */
const dropPreviousAccount = () => {
  logger.log('[account] another account: dropping its Supporter state')
  useSupporter.getState().setSupporter(false)
  setPeerAccountClaims([])
  setOwnAccountClaim(null)
  clearAdoptedAccountId()
}

const bind = (account: string) => {
  bindSupporterAccount(account)
  for (const listener of accountSwitchedListeners) {
    try {
      listener()
    } catch (error) {
      errorTracking.captureException(error)
    }
  }
}

/** Where the account this device's Supporter state belongs to is kept. */
const supporterAccount = {
  store: {
    entry: () => useServerSupporter.getState().entry,
    setEntry: setServerSupporterEntry,
    setAccount: setServerSupporterAccount,
    bound: boundSupporterAccount,
    bind,
  },
  onAccountSwitched: dropPreviousAccount,
}

/**
 * The server account (`accountFingerprint`) whose RevenueCat claims this device
 * takes (ADR 0011, ADR 0040 §7): its session's, confirmed, else the last one
 * bound. Null when it never had one.
 */
export const currentSupporterAccount = async (): Promise<string | null> => {
  try {
    const accountId = await currentSessionAccount()
    if (accountId) return confirmSupporterAccount(supporterAccount, accountId)
  } catch {
    // The session store can't be read: the bound account stands.
  }
  return boundSupporterAccount()
}

/** The session's account, confirmed before it's linked or read for. */
const confirmed = (accountId: string | null): string | null => {
  if (accountId) confirmSupporterAccount(supporterAccount, accountId)
  return accountId
}

export const revenueCatLink = createRevenueCatLink({
  baseUrl: apis.accounts,
  request: (options, accountId) =>
    accountSessions.request(options, { accountId }),
  confirmAccount: async () => confirmed(await currentSessionAccount()),
  sessionAccount: () => currentSessionAccount(),
  openAccount: async () => {
    const { accountId } = await accountSessions.ensure()
    confirmed(accountId)
    return accountId
  },
  appUserId: async () => {
    // Before `Purchases.configure` (or without an SDK key) there's no
    // customer to link.
    if (!(await Purchases.isConfigured())) return null
    const appUserId = await Purchases.getAppUserID()
    // RevenueCat is still another id than this device's (another account's,
    // until `AccountProvider` logs in again): nothing to link yet.
    try {
      return appUserId === getOrCreateAccountId() ? appUserId : null
    } catch {
      return null
    }
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
        listener({
          supporter: outcome.supporter,
          expiresAt: outcome.expiresAt,
          accountId: outcome.accountId,
        })
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

/**
 * The account's Supporter status as ww-api answers it, for `useIsSupporter`
 * when RevenueCat doesn't say Supporter. Read on the existing session only.
 */
export const serverSupporter = createServerSupporter({
  // A session an older key left is replaced (ADR 0039 §7): otherwise the
  // same account would read as signed out until something else opens one.
  currentAccount: () => currentSessionAccount({ reopenStale: true }),
  link: (reason) => revenueCatLink.ensure({ reason }),
  fetchStatus: (accountId) => revenueCatLink.fetchStatus(accountId),
  ...supporterAccount,
  now: Date.now,
})

onRevenueCatLinked(
  ({ accountId, ...status }) => void serverSupporter.record(accountId, status)
)

onAccountChange((change) => {
  // Registered after the link's listener, so the read joins that link.
  if (change === 'key_changed') void serverSupporter.accountChanged()
  else void serverSupporter.refresh({ force: true, reason: 'session_opened' })
})

// At most every few hours (the answer remembers when it was read).
addForegroundListener(
  () => void serverSupporter.refresh({ reason: 'foreground' })
)
void serverSupporter.refresh({ reason: 'launch' })
