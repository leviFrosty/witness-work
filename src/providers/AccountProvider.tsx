import { perf } from '@/lib/perf'
import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { addForegroundListener } from '@/lib/appLifecycle'
import { addReconnectListener } from '@/lib/http/online'
import { invalidateCustomerInfoCache } from '@/lib/revenueCatBrowser'
import Purchases from 'react-native-purchases'
import { errorTracking } from '@/lib/errorTracking'
import { toPurchasesError } from '@/lib/purchasesError'
import debounce from 'lodash/debounce'
import { hasSyncTransport, syncTransport } from '@/lib/syncTransport'
import { AccountContext, AccountCtx } from '@/contexts/account'
import useCustomer from '@/hooks/useCustomer'
import { supporterSinceDate } from '@/lib/supporterSince'
import type { AccountFile } from '@/lib/accountFile'
import { decideAccountReconcile } from '@/lib/accountClaim'
import {
  onPeerAccountClaimsChange,
  peerAccountClaims,
  setOwnAccountClaim,
} from '@/lib/accountClaimRegistry'
import {
  adoptAccountId,
  devAccountFileStaged,
  getOrCreateAccountId,
  onDevAccountFileChange,
  getOwnAccountClaim,
  readAccountFile,
  writeAccountFile,
} from '@/lib/account'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import {
  currentSupporterAccount,
  ensureRevenueCatLinked,
  onSupporterAccountSwitched,
} from '@/lib/serverAccount/revenueCatLinkRuntime'
import {
  devRevenueCatLogInsFail,
  noteRevenueCatAppUserId,
  revenueCatIsOwn,
} from '@/lib/revenueCatIdentity'
import { isOfflineError } from '@/lib/offlineError'
import { checkICloudIdentity } from '@/lib/iCloudIdentity'
import { InstallIdUnavailableError } from '@/lib/installId'

interface Props {}

/** `Purchases.logIn`, noting whose customer RevenueCat now has. */
const logIn = async (appUserId: string) => {
  if (devRevenueCatLogInsFail())
    throw new Error('The Internet connection appears to be offline.')
  const result = await Purchases.logIn(appUserId)
  noteRevenueCatAppUserId(appUserId)
  return result
}

/** `getOrCreateAccountId`, or null while it can't be read. */
const ownIdOrNull = (): string | null => {
  try {
    return getOrCreateAccountId()
  } catch {
    return null
  }
}

/**
 * Foreground reconciles at most this often. A change to the account file fires
 * `remote-change` on its own (iCloud's metadata query, Drive's poll), and
 * entitlement changes re-run it through customer state, so the foreground pass
 * is only a backstop. Each one costs an account-file read, a Drive request on
 * Android.
 */
const FOREGROUND_RECONCILE_INTERVAL_MS = 15 * 60_000

/**
 * Keeps this device's account id in agreement with the user's other devices
 * (ADR 0011). Runs the reconcile pass — read the account file, then claim /
 * adopt / refresh per `decideAccountAction` — whenever entitlement state, cloud
 * availability, or the remote file changes, and on foreground.
 *
 * This is what makes Supporter multi-device work with no app account: the
 * device that holds the entitlement claims its id; every other device on the
 * same Apple ID adopts it via `Purchases.logIn`, becoming the same RevenueCat
 * customer, so the entitlement (and later its lapse) applies everywhere. On
 * Android the file lives in the Google Drive app data folder (ADR 0019), so
 * devices share it once each has connected the same Google Account.
 *
 * Must live inside `CustomerProvider`: adoption replaces the active RevenueCat
 * user, and the fresh CustomerInfo has to land in customer state immediately.
 */
const AccountProvider: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const { customer, ready, unavailable, setCustomer } = useCustomer()
  const [accountId, setAccountIdState] = useState<string | null>(() => {
    try {
      return getOrCreateAccountId()
    } catch (error) {
      logger.error('[Account] account id resolution failed', error)
      // `installId` already reported it.
      if (!(error instanceof InstallIdUnavailableError))
        errorTracking.captureException(error)
      return null
    }
  })
  // Optimistic until the first reconcile probes the container: `isAvailable`
  // only proves iCloud sign-in (or a connected Google Drive); iCloud Drive
  // being disabled for the app surfaces as a read rejection and flips this
  // false.
  const [iCloudSharingAvailable, setICloudSharingAvailable] = useState(
    () => hasSyncTransport() && syncTransport().isAvailable()
  )

  // Latest customer state for event-driven reconciles without resubscribing.
  const customerRef = useRef(customer)
  const readyRef = useRef(ready)
  const unavailableRef = useRef(unavailable)
  useEffect(() => {
    customerRef.current = customer
    readyRef.current = ready
    unavailableRef.current = unavailable
  }, [customer, ready, unavailable])

  // What RevenueCat is identified as, read by reconcile: a follow-up queued
  // behind the pass that changed it still runs with the old render's state.
  const accountIdRef = useRef(accountId)
  const setAccountId = useCallback((id: string) => {
    accountIdRef.current = id
    setAccountIdState(id)
  }, [])

  // True until RevenueCat is logged in as this device's account id. Before
  // `configure` there's nothing to identify yet.
  const isRevenueCatAnonymous = useCallback(
    async (): Promise<boolean> =>
      readyRef.current &&
      (accountIdRef.current === null || (await Purchases.isAnonymous())),
    []
  )

  const inFlightRef = useRef(false)
  const queuedReasonRef = useRef<string | null>(null)

  const reconcile = useCallback(
    async (reason: string): Promise<void> => {
      perf.count('account:reconcile')
      // RevenueCat is configured, or never will be this launch (no SDK key).
      const revenueCatConfigured = readyRef.current
      if (!revenueCatConfigured && !unavailableRef.current) return
      // Entitlement truth isn't known until the initial CustomerInfo lands;
      // acting on the transient "no customer" state could mis-claim.
      if (revenueCatConfigured && customerRef.current === null) return

      if (inFlightRef.current) {
        // Coalesce: one queued follow-up is enough — it re-reads everything.
        queuedReasonRef.current ??= reason
        return
      }
      inFlightRef.current = true
      try {
        // The server account whose claims count here, confirmed first: another
        // one than the bound one drops the id adopted for that one.
        const account = await currentSupporterAccount()

        if (await isRevenueCatAnonymous()) {
          // RevenueCat stayed anonymous: the Keychain refused the id at launch
          // (before the first unlock), or the launch's logIn failed (a first
          // launch offline; later launches reuse the SDK's saved user id). This
          // is the only place that identifies it afterwards; until the id reads
          // and RevenueCat answers this throws, and the next return to the app
          // or the connection coming back tries again.
          const id = getOrCreateAccountId()
          const { customerInfo } = await logIn(id)
          const changed = id !== accountIdRef.current
          setAccountId(id)
          setCustomer(customerInfo)
          void ensureRevenueCatLinked({ force: true, reason: 'adopted' })
          logger.log('[Account] identified after launch', { reason })
          if (changed) {
            // A follow-up queued meanwhile would still see the anonymous
            // customer. The new id re-runs reconcile with matching state.
            queuedReasonRef.current = null
            return
          }
          // Same id, so nothing re-runs this: carry on with the identified
          // customer.
          customerRef.current = customerInfo
        }

        // The account file lives on the platform's transport (iCloud, or
        // Drive), whichever transport sync runs on. The dev harness can
        // stage one on simulators, which have neither.
        const devFile = devAccountFileStaged()
        const fileTransport = devFile || hasSyncTransport()
        const fileTransportReady =
          devFile || (fileTransport && syncTransport().isAvailable())
        if (fileTransport && !fileTransportReady)
          setICloudSharingAvailable(false)

        // A different Apple Account, or another server account, clears the
        // adopted id. Until RevenueCat is back on this device's own id, the
        // previous account's id (and its entitlement) must not claim the new
        // account's file. RevenueCat can also still be on another id than
        // the one this launch identified it as (its login failed offline).
        if (fileTransportReady && !devFile)
          checkICloudIdentity('account_reconcile')
        const current = getOrCreateAccountId()
        if (
          current !== accountIdRef.current ||
          (revenueCatConfigured && !revenueCatIsOwn())
        ) {
          const changed = current !== accountIdRef.current
          if (revenueCatConfigured) {
            const { customerInfo } = await logIn(current)
            setCustomer(customerInfo)
            customerRef.current = customerInfo
          }
          setAccountId(current)
          void ensureRevenueCatLinked({ force: true, reason: 'adopted' })
          logger.log('[Account] re-identified after account id reset', {
            reason,
          })
          errorTracking.addBreadcrumb({
            category: 'account',
            message: `re-identify (${reason})`,
            level: 'info',
          })
          // The new id re-runs reconcile with matching customer state. The
          // same id doesn't: carry on with its customer.
          if (changed) return
        }

        // Without RevenueCat (no SDK key) this device can't be entitled, but
        // it still agrees on the account's id, so it's the right customer
        // once RevenueCat is there.
        const entitled =
          revenueCatConfigured &&
          supporterSinceDate(customerRef.current) !== null
        const own = getOwnAccountClaim(entitled, account)
        // Published in this device's sync payload.
        setOwnAccountClaim(own)

        let file: AccountFile | null = null
        let fileRead = false
        let scanned = true
        if (fileTransportReady) {
          // Don't trust an early empty directory listing — claiming before
          // the container materializes would shadow another device's real
          // claim.
          scanned = devFile || (await syncTransport().waitForInitialScan(5000))
          try {
            const read = await readAccountFile()
            setICloudSharingAvailable(true)
            if (read.pending) {
              // The file still downloading may be another device's claim, so
              // no decision is safe yet — a claim would overwrite it. Pending
              // files stay unobserved, so the metadata query reports the file
              // again once it lands and `remote-change` re-runs this.
              logger.log('[Account] deferred (account file downloading)', {
                reason,
              })
              return
            }
            file = read.file
            fileRead = true
          } catch (error) {
            // Signed in but container unreachable (iCloud Drive off for the
            // app) — expected for a minority of users, not an error. The
            // sync data's claims still count.
            logger.warn('[Account] account file unreadable', {
              reason,
              error: (error as Error).message,
            })
            setICloudSharingAvailable(false)
          }
        }

        const action = decideAccountReconcile({
          own,
          file,
          fileRead,
          peers: peerAccountClaims(),
          account,
        })

        switch (action.type) {
          case 'claim': {
            if (!file && !scanned) {
              // Empty listing before the initial scan finished is not proof
              // of absence. Skip; the next trigger retries.
              logger.log('[Account] claim deferred (initial scan incomplete)')
              return
            }
            await writeAccountFile(own)
            logger.log('[Account] claimed account file', { reason, entitled })
            errorTracking.addBreadcrumb({
              category: 'account',
              message: `claim (${reason})`,
              level: 'info',
            })
            return
          }
          case 'adopt': {
            if (revenueCatConfigured) {
              const { customerInfo } = await logIn(action.accountId)
              setCustomer(customerInfo)
            }
            // Kept with its account: if another one signed in during the
            // login, the id is dropped and the queued pass logs in again.
            adoptAccountId(action.accountId, action.claimedAt, action.account)
            setAccountId(action.accountId)
            // Another RevenueCat customer: link it to the server account.
            void ensureRevenueCatLinked({ force: true, reason: 'adopted' })
            analytics.capture('account_id_adopted', {
              source: action.source,
              revenuecat: revenueCatConfigured,
            })
            logger.log('[Account] adopted shared account id', {
              reason,
              source: action.source,
            })
            errorTracking.addBreadcrumb({
              category: 'account',
              message: `adopt (${action.source}, ${reason})`,
              level: 'info',
            })
            return
          }
          case 'refresh': {
            // Without RevenueCat there's no truth to fetch.
            if (!revenueCatConfigured) return
            // The file disagrees with our cached entitlement for our own id —
            // another device purchased or lapsed. Fetch the truth, then
            // correct the file only if IT was the stale side.
            void invalidateCustomerInfoCache()
            const info = await Purchases.getCustomerInfo()
            setCustomer(info)
            const entitledNow = supporterSinceDate(info) !== null
            if (file && entitledNow !== file.entitled) {
              await writeAccountFile({ ...own, entitled: entitledNow })
            }
            logger.log('[Account] refreshed entitlement from remote flag', {
              reason,
              entitledNow,
            })
            return
          }
          case 'none':
            return
        }
      } catch (error) {
        // Offline logIn/getCustomerInfo is expected and retried on the next
        // trigger; anything else is worth a report.
        if (isOfflineError(error)) {
          logger.warn('[Account] reconcile offline', { reason })
        } else if (error instanceof InstallIdUnavailableError) {
          logger.warn('[Account] account id still unavailable', { reason })
        } else {
          logger.error('[Account] reconcile failed', error)
          errorTracking.captureException(
            toPurchasesError(error, { background: true })
          )
        }
      } finally {
        inFlightRef.current = false
        const queued = queuedReasonRef.current
        queuedReasonRef.current = null
        if (queued) void reconcile(queued)
      }
    },
    [isRevenueCatAnonymous, setAccountId, setCustomer]
  )

  // A new id (identified, adopted, or reset) re-runs reconcile once customer
  // state matches it.
  const reconciledIdRef = useRef(accountId)
  useEffect(() => {
    if (reconciledIdRef.current === accountId) return
    reconciledIdRef.current = accountId
    void reconcile('account-id')
  }, [accountId, reconcile])

  // Boot + entitlement transitions (purchase, restore, lapse, adoption).
  const customerKnown = customer !== null
  const entitled = supporterSinceDate(customer) !== null
  useEffect(() => {
    void reconcile('customer-state')
  }, [reconcile, ready, unavailable, customerKnown, entitled])

  // Another server account signed in, and the id adopted for the previous one
  // is gone: log RevenueCat in as this device's own again.
  useEffect(
    () => onSupporterAccountSwitched(() => void reconcile('account-switched')),
    [reconcile]
  )

  // The dev harness staged an account file.
  useEffect(() => {
    if (!__DEV__) return
    return onDevAccountFileChange(() => void reconcile('dev-account-file'))
  }, [reconcile])

  // Another device's claim arrived in the sync data (ADR 0040 §7).
  useEffect(() => {
    const debouncedReconcile = debounce(
      () => void reconcile('sync-claims'),
      500,
      { leading: true, trailing: true }
    )
    const unsubscribe = onPeerAccountClaimsChange(debouncedReconcile)
    return () => {
      unsubscribe()
      debouncedReconcile.cancel()
    }
  }, [reconcile])

  // Every return to the app and every reconnect until RevenueCat is
  // identified as this device's id (after another server account signed in,
  // RevenueCat stays on the previous one's until a login works); the
  // throttled foreground pass below may not run for 15 minutes.
  useEffect(() => {
    const retry = (reason: string) =>
      void isRevenueCatAnonymous().then(
        (anonymous) => {
          if (
            anonymous ||
            (readyRef.current &&
              (!revenueCatIsOwn() || accountIdRef.current !== ownIdOrNull()))
          )
            void reconcile(reason)
        },
        () => {}
      )
    const foregroundSub = addForegroundListener(() => retry('foreground'))
    const reconnectSub = addReconnectListener(() => retry('reconnect'))
    return () => {
      foregroundSub.remove()
      reconnectSub.remove()
    }
  }, [isRevenueCatAnonymous, reconcile])

  useEffect(() => {
    if (!hasSyncTransport()) return

    // Same echo-burst problem the sync engine has: iCloud re-stamps mtimes as
    // a write replicates, producing trailing notifications ~500ms apart.
    const debouncedReconcile = debounce(
      (reason: string) => void reconcile(reason),
      500,
      { leading: true, trailing: true }
    )
    const remoteSub = syncTransport().addRemoteChangeListener(() => {
      debouncedReconcile('remote-change')
    })
    const availabilitySub = syncTransport().addAvailabilityChangeListener(
      (e) => {
        setICloudSharingAvailable(e.available)
        if (e.available) void reconcile('icloud-available')
      }
    )
    const foregroundSub = addForegroundListener(
      () => void reconcile('foreground'),
      { minIntervalMs: FOREGROUND_RECONCILE_INTERVAL_MS }
    )

    return () => {
      remoteSub.remove()
      availabilitySub.remove()
      foregroundSub.remove()
      debouncedReconcile.cancel()
    }
  }, [reconcile])

  const context: AccountCtx = { accountId, iCloudSharingAvailable }

  return (
    <AccountContext.Provider value={context}>
      {children}
    </AccountContext.Provider>
  )
}

export default AccountProvider
