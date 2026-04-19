import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CustomerContext, CustomerCtx } from '../contexts/customer'
import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases'
import * as Sentry from '@sentry/react-native'
import { logger } from '../lib/logger'

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
      Sentry.captureException(error)
    }
  }, [])

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    // `configure` returns void synchronously; `setLogLevel` is fire-and-forget.
    // Flip `ready` immediately after so downstream screens can fetch offerings.
    const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY || ''
    logger.log('[CustomerProvider] init', {
      hasApiKey: apiKey.length > 0,
      apiKeyLength: apiKey.length,
      apiKeyPrefix: apiKey.slice(0, 5),
    })

    try {
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG)
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

    // Best-effort initial customer fetch. Swallow network/launch errors —
    // the user may be offline and we can't recover here.
    Purchases.getCustomerInfo()
      .then((info) => {
        logger.log('[CustomerProvider] initial getCustomerInfo success', {
          originalAppUserId: info.originalAppUserId,
          activeEntitlements: Object.keys(info.entitlements.active),
        })
        setCustomer(info)
      })
      .catch((error) => {
        logger.warn('[CustomerProvider] initial getCustomerInfo failed', error)
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
