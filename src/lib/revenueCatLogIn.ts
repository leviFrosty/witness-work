import Purchases from 'react-native-purchases'
import {
  devRevenueCatLogInsFail,
  noteRevenueCatAppUserId,
} from '@/lib/revenueCatIdentity'

/** `Purchases.logIn`, noting whose customer RevenueCat now has. */
export const logInRevenueCat = async (appUserId: string) => {
  if (devRevenueCatLogInsFail())
    throw new Error('The Internet connection appears to be offline.')
  const result = await Purchases.logIn(appUserId)
  noteRevenueCatAppUserId(appUserId)
  return result
}
