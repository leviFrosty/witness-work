import { useEffect, useRef, useState } from 'react'
import Purchases from 'react-native-purchases'
import { errorTracking } from '@/lib/errorTracking'
import { toPurchasesError } from '@/lib/purchasesError'
import useCustomer from '@/hooks/useCustomer'
import { logger } from '@/lib/logger'
import { isConnectivityError } from '@/lib/http/networkError'
import { addReconnectListener } from '@/lib/http/online'
import { addForegroundListener } from '@/lib/appLifecycle'

/**
 * Returns the cheapest per-month-equivalent supporter price across all
 * RevenueCat offerings — comparing monthly subscriptions against the
 * monthly-equivalent of annual subscriptions and picking whichever is lower.
 * Used by the touch paywall sheet to nudge users with a concrete low price
 * instead of a generic "Learn more" CTA. A failed load (usually offline at
 * launch) tries again when the connection comes back or the app returns to the
 * foreground.
 */
const useCheapestSupporterPrice = () => {
  const { ready } = useCustomer()
  const [priceString, setPriceString] = useState<string | null>(null)
  const hasFetched = useRef(false)
  // Bumped to load again after a failure.
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!failed) return
    const retry = () => {
      setFailed(false)
      setAttempt((current) => current + 1)
    }
    const reconnect = addReconnectListener(retry)
    const foreground = addForegroundListener(retry)
    return () => {
      reconnect.remove()
      foreground.remove()
    }
  }, [failed])

  useEffect(() => {
    if (!ready || hasFetched.current) return
    hasFetched.current = true

    Purchases.getOfferings()
      .then((offerings) => {
        const candidates: { perMonth: number; display: string }[] = []
        for (const key of Object.keys(offerings.all)) {
          const offering = offerings.all[key]
          const monthly = offering.monthly
          if (monthly) {
            candidates.push({
              perMonth: monthly.product.price,
              display: monthly.product.priceString,
            })
          }
          const annual = offering.annual
          if (annual && annual.product.pricePerMonthString) {
            candidates.push({
              perMonth: annual.product.price / 12,
              display: annual.product.pricePerMonthString,
            })
          }
        }
        if (candidates.length === 0) return
        candidates.sort((a, b) => a.perMonth - b.perMonth)
        setPriceString(candidates[0].display)
      })
      .catch((error) => {
        // Touch paywall falls back to its default CTA if pricing isn't
        // available — no user-facing error needed.
        hasFetched.current = false
        setFailed(true)
        logger.warn('[useCheapestSupporterPrice] getOfferings failed', error)
        if (!isConnectivityError(error))
          errorTracking.captureException(
            toPurchasesError(error, { background: true })
          )
      })
  }, [ready, attempt])

  return { priceString }
}

export default useCheapestSupporterPrice
