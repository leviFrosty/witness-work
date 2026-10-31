import { Platform } from 'react-native'
import Purchases from 'react-native-purchases'

/**
 * Where RevenueCat's browser mode (the web) differs from the native SDKs
 * (docs/web-purchases.md "The SDK").
 */

/**
 * Drops the SDK's cached customer info so the next `getCustomerInfo` asks
 * RevenueCat. Browser mode keeps no copy (each read is a request) and throws
 * "not supported on web platform" here, so the web skips it.
 */
export async function invalidateCustomerInfoCache(): Promise<void> {
  if (Platform.OS === 'web') return
  await Purchases.invalidateCustomerInfoCache()
}

/** Where browser mode saves the app user id on every `configure`. */
const BROWSER_APP_USER_ID_KEY = 'revenuecat_user_id'

/**
 * Removes the app user id browser mode saves in `localStorage`. The web keeps
 * nothing there (docs/web-storage.md), so signing out wouldn't clear it, and
 * the id is a capability (ADR 0029). The app has the id itself and configures
 * with it on every launch.
 */
export function forgetBrowserAppUserId(): void {
  if (Platform.OS !== 'web') return
  try {
    globalThis.localStorage?.removeItem(BROWSER_APP_USER_ID_KEY)
  } catch {
    // Storage refused (a private window): browser mode couldn't save it either.
  }
}
