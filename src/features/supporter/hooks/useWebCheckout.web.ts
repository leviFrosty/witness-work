import { appVariant } from '@/lib/appVariant'
import { webSignInLater } from '@/lib/serverAccount/webSignInMark'
import { reloadPage } from '@/lib/serverAccount/webTabs'
import { useVisitorLocation } from '@/hooks/useVisitorLocation'
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

const SAVE_TIMEOUT_MS = 1_000

export default function useWebCheckout(): WebCheckout {
  const { appUserId, waitingFor } = useWebCheckoutCustomer()
  const visitor = useVisitorLocation()
  const region =
    visitor.status === 'loading'
      ? 'loading'
      : webSalesAllowed(visitor)
        ? 'allowed'
        : 'blocked'

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

      await Promise.race([
        webStores.flush().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, SAVE_TIMEOUT_MS)),
      ])
      window.location.assign(url)
      return true
    },

    signIn: () => {
      webSignInLater.clear()
      reloadPage()
    },
  }
}
