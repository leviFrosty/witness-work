import { Platform } from 'react-native'
import Purchases from 'react-native-purchases'

export async function invalidateCustomerInfoCache(): Promise<void> {
  if (Platform.OS === 'web') return
  await Purchases.invalidateCustomerInfoCache()
}

const BROWSER_APP_USER_ID_KEY = 'revenuecat_user_id'

export function forgetBrowserAppUserId(): void {
  if (Platform.OS !== 'web') return
  try {
    globalThis.localStorage?.removeItem(BROWSER_APP_USER_ID_KEY)
  } catch {}
}
