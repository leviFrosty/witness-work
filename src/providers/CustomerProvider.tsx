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
import useDevice from '../hooks/useDevice'
import * as Sentry from '@sentry/react-native'

interface Props {}

/**
 * Handles initialization and fetching of customer info in-app-purchases
 *
 * Uses [RevenueCat](https://www.revenuecat.com/docs/reactnative) SDK.
 */
const CustomerProvider: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const [customer, setCustomer] = useState<CustomerInfo | null>(null)
  const { isAndroid } = useDevice()
  const hasInitialized = useRef(false)

  const getCustomerInfo = useCallback(async () => {
    try {
      const customerInfo = await Purchases.getCustomerInfo()
      setCustomer(customerInfo)
    } catch (error) {
      Sentry.captureException(error)
    }
  }, [])

  const initialize = useCallback(async () => {
    try {
      if (isAndroid) {
        return
      } else {
        __DEV__ && Purchases.setLogLevel(LOG_LEVEL.DEBUG)
        await Purchases.configure({
          apiKey: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY || '',
        })
      }

      const customerInfo = await Purchases.getCustomerInfo()
      setCustomer(customerInfo)
    } catch (error) {
      // Do nothing, the user does not have a internet connection or is not able to connect to RevenueCat servers at launch.
      // Regardless, we are not able to resolve these issues.
    }
  }, [isAndroid])

  useEffect(() => {
    const setup = async () => {
      await initialize()
      await getCustomerInfo()
    }

    if (isAndroid || hasInitialized.current) {
      return
      // For now, android does not support donations.
    }

    hasInitialized.current = true
    setup()
  }, [isAndroid, initialize, getCustomerInfo])

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
  }

  return (
    <CustomerContext.Provider value={context}>
      {children}
    </CustomerContext.Provider>
  )
}

export default CustomerProvider
