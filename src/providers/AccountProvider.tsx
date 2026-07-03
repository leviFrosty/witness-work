import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { AppState, Platform } from 'react-native'
import Purchases from 'react-native-purchases'
import * as Sentry from '@sentry/react-native'
import _ from 'lodash'
import * as ICloudBridge from '../../modules/icloud-bridge'
import { AccountContext, AccountCtx } from '@/contexts/account'
import useCustomer from '@/hooks/useCustomer'
import { supporterSinceDate } from '@/lib/supporterSince'
import { decideAccountAction } from '@/lib/accountFile'
import {
  adoptAccountId,
  getOrCreateAccountId,
  readAccountFile,
  writeAccountFile,
} from '@/lib/account'
import { logger } from '@/lib/logger'
import { isOfflineError } from '@/lib/offlineError'

interface Props {}

/**
 * Keeps this device's account id in agreement with the user's other devices
 * (ADR 0011). Runs the reconcile pass — read the iCloud account file, then
 * claim / adopt / refresh per `decideAccountAction` — whenever entitlement
 * state, iCloud availability, or the remote file changes, and on foreground.
 *
 * This is what makes Supporter multi-device work with no sign-in: the device
 * that holds the entitlement claims its id; every other device on the same
 * Apple ID adopts it via `Purchases.logIn`, becoming the same RevenueCat
 * customer, so the entitlement (and later its lapse) applies everywhere.
 *
 * Must live inside `CustomerProvider`: adoption replaces the active RevenueCat
 * user, and the fresh CustomerInfo has to land in customer state immediately.
 */
const AccountProvider: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const { customer, ready, setCustomer } = useCustomer()
  const [accountId, setAccountId] = useState<string | null>(() => {
    try {
      return getOrCreateAccountId()
    } catch (error) {
      logger.error('[Account] account id resolution failed', error)
      Sentry.captureException(error)
      return null
    }
  })
  // Optimistic until the first reconcile probes the container: `isAvailable`
  // only proves iCloud sign-in; iCloud Drive being disabled for the app
  // surfaces as a readAll rejection and flips this false.
  const [iCloudSharingAvailable, setICloudSharingAvailable] = useState(
    () => Platform.OS === 'ios' && ICloudBridge.isAvailable()
  )

  // Latest customer state for event-driven reconciles without resubscribing.
  const customerRef = useRef(customer)
  const readyRef = useRef(ready)
  useEffect(() => {
    customerRef.current = customer
    readyRef.current = ready
  }, [customer, ready])

  const inFlightRef = useRef(false)
  const queuedReasonRef = useRef<string | null>(null)

  const reconcile = useCallback(
    async (reason: string): Promise<void> => {
      if (Platform.OS !== 'ios') return
      if (!readyRef.current) return
      // Entitlement truth isn't known until the initial CustomerInfo lands;
      // acting on the transient "no customer" state could mis-claim.
      if (customerRef.current === null) return
      if (accountId === null) return

      if (inFlightRef.current) {
        // Coalesce: one queued follow-up is enough — it re-reads everything.
        queuedReasonRef.current ??= reason
        return
      }
      inFlightRef.current = true
      try {
        if (!ICloudBridge.isAvailable()) {
          setICloudSharingAvailable(false)
          return
        }

        // Don't trust an early empty directory listing — claiming before the
        // container materializes would shadow another device's real claim.
        const scanned = await ICloudBridge.waitForInitialScan(5000)

        let file
        try {
          file = await readAccountFile()
        } catch (error) {
          // Signed in but container unreachable (iCloud Drive off for the
          // app) — expected for a minority of users, not an error.
          logger.warn('[Account] account file unreadable', {
            reason,
            error: (error as Error).message,
          })
          setICloudSharingAvailable(false)
          return
        }
        setICloudSharingAvailable(true)

        const mine = getOrCreateAccountId()
        const entitled = supporterSinceDate(customerRef.current) !== null
        const action = decideAccountAction({ accountId: mine, entitled, file })

        switch (action.type) {
          case 'claim': {
            if (!file && !scanned) {
              // Empty listing before the initial scan finished is not proof
              // of absence. Skip; the next trigger retries.
              logger.log('[Account] claim deferred (initial scan incomplete)')
              return
            }
            await writeAccountFile(mine, entitled)
            logger.log('[Account] claimed account file', { reason, entitled })
            Sentry.addBreadcrumb({
              category: 'account',
              message: `claim (${reason})`,
              level: 'info',
            })
            return
          }
          case 'adopt': {
            const { customerInfo } = await Purchases.logIn(action.accountId)
            adoptAccountId(action.accountId)
            setAccountId(action.accountId)
            setCustomer(customerInfo)
            logger.log('[Account] adopted shared account id', { reason })
            Sentry.addBreadcrumb({
              category: 'account',
              message: `adopt (${reason})`,
              level: 'info',
            })
            return
          }
          case 'refresh': {
            // The file disagrees with our cached entitlement for our own id —
            // another device purchased or lapsed. Fetch the truth, then
            // correct the file only if IT was the stale side.
            Purchases.invalidateCustomerInfoCache()
            const info = await Purchases.getCustomerInfo()
            setCustomer(info)
            const entitledNow = supporterSinceDate(info) !== null
            if (file && entitledNow !== file.entitled) {
              await writeAccountFile(mine, entitledNow)
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
        } else {
          logger.error('[Account] reconcile failed', error)
          Sentry.captureException(error)
        }
      } finally {
        inFlightRef.current = false
        const queued = queuedReasonRef.current
        queuedReasonRef.current = null
        if (queued) void reconcile(queued)
      }
    },
    [accountId, setCustomer]
  )

  // Boot + entitlement transitions (purchase, restore, lapse, adoption).
  const customerKnown = customer !== null
  const entitled = supporterSinceDate(customer) !== null
  useEffect(() => {
    void reconcile('customer-state')
  }, [reconcile, ready, customerKnown, entitled])

  useEffect(() => {
    if (Platform.OS !== 'ios') return

    // Same echo-burst problem the sync engine has: iCloud re-stamps mtimes as
    // a write replicates, producing trailing notifications ~500ms apart.
    const debouncedReconcile = _.debounce(
      (reason: string) => void reconcile(reason),
      500,
      { leading: true, trailing: true }
    )
    const remoteSub = ICloudBridge.addRemoteChangeListener(() => {
      debouncedReconcile('remote-change')
    })
    const availabilitySub = ICloudBridge.addAvailabilityChangeListener((e) => {
      setICloudSharingAvailable(e.available)
      if (e.available) void reconcile('icloud-available')
    })
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcile('foreground')
    })

    return () => {
      remoteSub.remove()
      availabilitySub.remove()
      appStateSub.remove()
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
