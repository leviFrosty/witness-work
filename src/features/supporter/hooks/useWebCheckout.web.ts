import { appVariant } from '@/lib/appVariant'
import { useVisitorCountry } from '@/hooks/useVisitorCountry'
import { webStores } from '@/lib/webStorage/webStores'
import { useWebCheckoutCustomer } from '@/features/supporter/hooks/useWebCheckoutCustomer'
import {
  saveWebCheckoutRecord,
  webCheckoutUrl,
  type WebCheckout,
} from '@/features/supporter/lib/webCheckout'
import { parseWebPurchaseLinks } from '@/features/supporter/lib/webPurchaseLinks'
import { webSalesAllowed } from '@/features/supporter/lib/webSalesRegions'

const links = parseWebPurchaseLinks(
  process.env.EXPO_PUBLIC_REVENUECAT_WEB_PURCHASE_LINKS
)

/** How long Buy waits for the checkout record to reach IndexedDB. */
const SAVE_TIMEOUT_MS = 1_000

/**
 * Buy on the web opens RevenueCat's hosted checkout in this tab
 * (docs/web-purchases.md "Links"), never `purchasePackage`. It's available once
 * the offering has a link, the customer is settled, and the visitor's country
 * gets web prices.
 */
export default function useWebCheckout(): WebCheckout {
  const { appUserId, waitingFor } = useWebCheckoutCustomer()
  const visitor = useVisitorCountry()
  const region =
    visitor.status === 'loading'
      ? 'loading'
      : webSalesAllowed(visitor.country)
        ? 'allowed'
        : 'blocked'

  // Built when asked, and never kept or written into the page, so session
  // replay and autocapture can't record it.
  const urlFor = (pkg: Parameters<WebCheckout['canBuy']>[0]) =>
    region === 'allowed'
      ? webCheckoutUrl({
          pkg,
          links,
          appUserId,
          origin: window.location.origin,
          variant: appVariant,
        })
      : null

  return {
    region,
    sells: (offeringIdentifier) => links.has(offeringIdentifier),
    waitingFor,
    canBuy: (pkg) => urlFor(pkg) !== null,
    open: async (pkg, tier) => {
      const url = urlFor(pkg)
      if (!url) return false
      saveWebCheckoutRecord(tier, Date.now())
      // Leaving the page could cut the write short.
      await Promise.race([
        webStores.flush().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, SAVE_TIMEOUT_MS)),
      ])
      window.location.assign(url)
      return true
    },
  }
}
