import { perf } from '@/lib/perf'
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
import { toPurchasesError } from '@/lib/purchasesError'
import { logger } from '@/lib/logger'
import { isOfflineError } from '@/lib/offlineError'
import { getOrCreateAccountId } from '@/lib/account'
import { InstallIdUnavailableError } from '@/lib/installId'
import { Platform } from 'react-native'
import { addForegroundListener } from '@/lib/appLifecycle'
import { addReconnectListener } from '@/lib/http/online'
import { ensureRevenueCatLinked } from '@/lib/serverAccount/revenueCatLinkRuntime'

interface Props {}

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
      if (isOfflineError(error)) {
        logger.warn('[CustomerProvider] getCustomerInfo offline', error)
        return
      }
      errorTracking.captureException(
        toPurchasesError(error, { background: true })
      )
    }
  }, [])

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    const apiKey =
      Platform.OS === 'android'
        ? process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY
        : process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY
    logger.log('[CustomerProvider] init')

    if (!apiKey) {
      setUnavailable(true)

      if (Platform.OS === 'android') {
        logger.log(
          '[CustomerProvider] Android purchases unavailable: no Google SDK key configured.'
        )
        return
      }

      const error = new Error(
        `[CustomerProvider] RevenueCat ${Platform.OS} SDK key is empty at runtime. Check the platform-specific EXPO_PUBLIC_REVENUECAT key and EAS visibility (must be sensitive/plaintext, not secret).`
      )
      logger.error(error.message)
      errorTracking.captureException(error)
      return
    }

    let accountId: string | undefined
    try {
      accountId = getOrCreateAccountId()
    } catch (error) {
      logger.error('[CustomerProvider] account id resolution failed', error)

      if (!(error instanceof InstallIdUnavailableError))
        errorTracking.captureException(error)
    }

    try {
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG)

      Purchases.configure({ apiKey })
      logger.log('[CustomerProvider] Purchases.configure completed')
      setReady(true)
    } catch (error) {
      logger.error('[CustomerProvider] Purchases.configure threw', error)
      errorTracking.captureException(error)
      setUnavailable(true)
      return
    }

    const seedCustomer = (info: CustomerInfo) => {
      logger.log('[CustomerProvider] initial customer info', {
        activeEntitlements: Object.keys(info.entitlements.active),
      })
      setCustomer(info)

      void ensureRevenueCatLinked({ reason: 'launch' })
    }

    perf.count('rc:identify')
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
        errorTracking.captureException(
          toPurchasesError(error, { background: true })
        )
      } else {
        logger.warn('[CustomerProvider] initial customer info failed', error)
      }

      if (accountId) {
        Purchases.getCustomerInfo()
          .then(seedCustomer)
          .catch(() => {})
      }
    })
  }, [])

  useEffect(() => {
    if (!ready) return
    const subscription = addReconnectListener(() => void getCustomerInfo())
    return () => subscription.remove()
  }, [ready, getCustomerInfo])

  const entitlements = customer
    ? Object.keys(customer.entitlements.active).sort().join('\n')
    : null
  const lastEntitlements = useRef<string | null>(null)
  useEffect(() => {
    if (entitlements === null) return
    const previous = lastEntitlements.current
    lastEntitlements.current = entitlements
    if (previous !== null && previous !== entitlements)
      void ensureRevenueCatLinked({ force: true, reason: 'entitlements' })
  }, [entitlements])

  useEffect(() => {
    const subscription = addForegroundListener(
      () => void ensureRevenueCatLinked({ reason: 'foreground' })
    )
    return () => subscription.remove()
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
