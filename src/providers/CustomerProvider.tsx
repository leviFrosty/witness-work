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
import { errorTracking } from '@/lib/errorTracking'
import { logger } from '@/lib/logger'
import { isOfflineError } from '@/lib/offlineError'
import { getOrCreateAccountId } from '@/lib/account'
import { Platform } from 'react-native'

interface Props {}

/**
 * Handles initialization and fetching of customer info in-app-purchases
 *
 * Uses [RevenueCat](https://www.revenuecat.com/docs/reactnative) SDK.
 */
const CustomerProvider: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const [customer, setCustomer] = useState<CustomerInfo | null>(null)
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const hasInitialized = useRef(false)

  const getCustomerInfo = useCallback(async () => {
    try {
      const customerInfo = await Purchases.getCustomerInfo()
      setCustomer(customerInfo)
    } catch (error) {
      // Offline is an expected, unrecoverable condition here — log it but don't
      // report to error tracking, otherwise an offline user revalidating in a loop
      // floods the dashboard (JW-TIME-5B).
      if (isOfflineError(error)) {
        logger.warn('[CustomerProvider] getCustomerInfo offline', error)
        return
      }
      errorTracking.captureException(error)
    }
  }, [])

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    // `configure` returns void synchronously; `setLogLevel` is fire-and-forget.
    // Flip `ready` immediately after so downstream screens can fetch offerings.
    const apiKey =
      Platform.OS === 'android'
        ? process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY
        : process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY
    logger.log('[CustomerProvider] init')

    if (!apiKey) {
      setUnavailable(true)
      // Android purchases can remain disabled until the Play app is configured.
      if (Platform.OS === 'android') {
        logger.log(
          '[CustomerProvider] Android purchases unavailable: no Google SDK key configured.'
        )
        return
      }
      // Empty key means the EAS env var was never inlined into the bundle —
      // typically caused by missing `EXPO_PUBLIC_` prefix or `secret`
      // visibility. Report loudly so TestFlight regressions don't ship
      // silently like they did before this guard was added.
      const error = new Error(
        `[CustomerProvider] RevenueCat ${Platform.OS} SDK key is empty at runtime. Check the platform-specific EXPO_PUBLIC_REVENUECAT key and EAS visibility (must be sensitive/plaintext, not secret).`
      )
      logger.error(error.message)
      errorTracking.captureException(error)
      return
    }

    // Resolve the stable account id: the iCloud-adopted shared id when this
    // device has joined another device's claim (ADR 0011), else the Keychain
    // install id (ADR 0007). Identifying RevenueCat as this id keeps
    // entitlements correlated with the identity the Notes-Import proxy meters.
    // If it can't resolve, stay anonymous rather than passing an empty id.
    let accountId: string | undefined
    try {
      accountId = getOrCreateAccountId()
    } catch (error) {
      logger.error('[CustomerProvider] account id resolution failed', error)
      errorTracking.captureException(error)
    }

    try {
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG)
      // Configure anonymously, THEN identify via logIn — NOT configure({
      // appUserID }) directly. Calling logIn from an anonymous user aliases that
      // user's purchases onto accountId, so an existing supporter (whose
      // entitlement is filed under their old anonymous id) keeps Supporter status
      // automatically, with no manual "Restore Purchases". A direct
      // configure({ appUserID }) would leave those anonymous purchases stranded.
      // logIn is idempotent (a no-op once accountId is already the active user),
      // so running it on every launch is safe.
      Purchases.configure({ apiKey })
      logger.log('[CustomerProvider] Purchases.configure completed')
      setReady(true)
    } catch (error) {
      // Misconfigured API key or unsupported platform — subsequent SDK calls
      // will fail, but the rest of the app should still load.
      logger.error('[CustomerProvider] Purchases.configure threw', error)
      errorTracking.captureException(error)
      setUnavailable(true)
      return
    }

    const seedCustomer = (info: CustomerInfo) => {
      logger.log('[CustomerProvider] initial customer info', {
        originalAppUserId: info.originalAppUserId,
        activeEntitlements: Object.keys(info.entitlements.active),
      })
      setCustomer(info)
    }

    // Identify (migrating any anonymous purchases onto accountId) and seed
    // customer state. logIn resolves with the post-migration CustomerInfo;
    // getCustomerInfo is the anonymous path when there's no account id.
    // Best-effort: on failure (usually offline) fall back to cached CustomerInfo
    // so existing entitlements still render, and logIn retries next launch.
    const identify = accountId
      ? Purchases.logIn(accountId).then(({ customerInfo, created }) => {
          logger.log('[CustomerProvider] Purchases.logIn completed', {
            created,
          })
          seedCustomer(customerInfo)
        })
      : Purchases.getCustomerInfo().then(seedCustomer)

    identify.catch((error) => {
      if (accountId && !isOfflineError(error)) {
        logger.warn('[CustomerProvider] Purchases.logIn failed', error)
        errorTracking.captureException(error)
      } else {
        logger.warn('[CustomerProvider] initial customer info failed', error)
      }
      // Last-resort fall back to whatever CustomerInfo the SDK has cached.
      if (accountId) {
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
    unavailable,
  }

  return (
    <CustomerContext.Provider value={context}>
      {children}
    </CustomerContext.Provider>
  )
}

export default CustomerProvider
