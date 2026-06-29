import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CustomerContext, CustomerCtx } from '@/contexts/customer'
import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases'
import * as Sentry from '@sentry/react-native'
import { logger } from '@/lib/logger'
import { isOfflineError } from '@/lib/offlineError'
import { getOrCreateInstallId } from '@/lib/installId'

interface Props {}

/**
 * Handles initialization and fetching of customer info in-app-purchases
 *
 * Uses [RevenueCat](https://www.revenuecat.com/docs/reactnative) SDK.
 */
const CustomerProvider: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const [customer, setCustomer] = useState<CustomerInfo | null>(null)
  const [ready, setReady] = useState(false)
  const hasInitialized = useRef(false)

  const getCustomerInfo = useCallback(async () => {
    try {
      const customerInfo = await Purchases.getCustomerInfo()
      setCustomer(customerInfo)
    } catch (error) {
      // Offline is an expected, unrecoverable condition here — log it but don't
      // report to Sentry, otherwise an offline user revalidating in a loop
      // floods the dashboard (JW-TIME-5B).
      if (isOfflineError(error)) {
        logger.warn('[CustomerProvider] getCustomerInfo offline', error)
        return
      }
      Sentry.captureException(error)
    }
  }, [])

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    // `configure` returns void synchronously; `setLogLevel` is fire-and-forget.
    // Flip `ready` immediately after so downstream screens can fetch offerings.
    const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY || ''
    logger.log('[CustomerProvider] init')

    if (!apiKey) {
      // Empty key means the EAS env var was never inlined into the bundle —
      // typically caused by missing `EXPO_PUBLIC_` prefix or `secret`
      // visibility. Report loudly so TestFlight regressions don't ship
      // silently like they did before this guard was added.
      const error = new Error(
        '[CustomerProvider] EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY is empty at runtime — RevenueCat will not function. Check EAS env var name and visibility (must be sensitive/plaintext, not secret).'
      )
      logger.error(error.message)
      Sentry.captureException(error)
      return
    }

    // Resolve the stable Keychain install id. We identify the RevenueCat user as
    // this id so entitlements correlate with the identity the Notes-Import proxy
    // meters (ADR 0007). If it can't resolve, stay anonymous rather than passing
    // an empty id.
    let installId: string | undefined
    try {
      installId = getOrCreateInstallId()
    } catch (error) {
      logger.error('[CustomerProvider] install id resolution failed', error)
      Sentry.captureException(error)
    }

    try {
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG)
      // Configure anonymously, THEN identify via logIn — NOT configure({
      // appUserID }) directly. Calling logIn from an anonymous user aliases that
      // user's purchases onto installId, so an existing supporter (whose
      // entitlement is filed under their old anonymous id) keeps Supporter status
      // automatically, with no manual "Restore Purchases". A direct
      // configure({ appUserID }) would leave those anonymous purchases stranded.
      // logIn is idempotent (a no-op once installId is already the active user),
      // so running it on every launch is safe.
      Purchases.configure({ apiKey })
      logger.log('[CustomerProvider] Purchases.configure completed')
      setReady(true)
    } catch (error) {
      // Misconfigured API key or unsupported platform — subsequent SDK calls
      // will fail, but the rest of the app should still load.
      logger.error('[CustomerProvider] Purchases.configure threw', error)
      Sentry.captureException(error)
      return
    }

    const seedCustomer = (info: CustomerInfo) => {
      logger.log('[CustomerProvider] initial customer info', {
        originalAppUserId: info.originalAppUserId,
        activeEntitlements: Object.keys(info.entitlements.active),
      })
      setCustomer(info)
    }

    // Identify (migrating any anonymous purchases onto installId) and seed
    // customer state. logIn resolves with the post-migration CustomerInfo;
    // getCustomerInfo is the anonymous path when there's no install id.
    // Best-effort: on failure (usually offline) fall back to cached CustomerInfo
    // so existing entitlements still render, and logIn retries next launch.
    const identify = installId
      ? Purchases.logIn(installId).then(({ customerInfo, created }) => {
          logger.log('[CustomerProvider] Purchases.logIn completed', {
            created,
          })
          seedCustomer(customerInfo)
        })
      : Purchases.getCustomerInfo().then(seedCustomer)

    identify.catch((error) => {
      if (installId && !isOfflineError(error)) {
        logger.warn('[CustomerProvider] Purchases.logIn failed', error)
        Sentry.captureException(error)
      } else {
        logger.warn('[CustomerProvider] initial customer info failed', error)
      }
      // Last-resort fall back to whatever CustomerInfo the SDK has cached.
      if (installId) {
        Purchases.getCustomerInfo()
          .then(seedCustomer)
          .catch(() => {})
      }
    })
  }, [])

  const hasPurchasedBefore = useMemo(
    () =>
      (customer?.allPurchaseDates
        ? Object.keys(customer.allPurchaseDates).length
        : 0) > 0,
    [customer?.allPurchaseDates]
  )

  const context: CustomerCtx = {
    customer,
    revalidate: getCustomerInfo,
    hasPurchasedBefore,
    setCustomer,
    ready,
  }

  return (
    <CustomerContext.Provider value={context}>
      {children}
    </CustomerContext.Provider>
  )
}

export default CustomerProvider
