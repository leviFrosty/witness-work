import { Alert, Platform } from 'react-native'
import * as Updates from 'expo-updates'
import i18n from '@/lib/locales'
import { errorTracking } from '@/lib/errorTracking'
import { RootStackParamList } from '@/types/rootStack'
import { analytics } from '@/lib/analytics'

type UpdateCheckOutcome =
  | 'available'
  | 'up_to_date'
  | 'unavailable'
  | 'failed'
  | 'busy'
let checking = false

export const fetchUpdate = async (
  handleNavigation: (destination: keyof RootStackParamList) => void,
  source: 'settings' | 'menu_bar' = 'settings'
): Promise<UpdateCheckOutcome> => {
  if (checking) return 'busy'
  if (__DEV__ || !Updates.isEnabled) {
    Alert.alert(i18n.t('updatesUnavailable'))
    analytics.capture('update_check_completed', {
      source,
      outcome: 'unavailable',
    })
    return 'unavailable'
  }

  checking = true
  analytics.capture('update_check_started', { source })
  try {
    const update = await Updates.checkForUpdateAsync()
    if (update.isAvailable) {
      handleNavigation('Update')
      analytics.capture('update_check_completed', {
        source,
        outcome: 'available',
      })
      return 'available'
    }
    Alert.alert(i18n.t('noUpdateAvailable'))
    analytics.capture('update_check_completed', {
      source,
      outcome: 'up_to_date',
    })
    return 'up_to_date'
  } catch (error) {
    Alert.alert(
      i18n.t(
        Platform.OS === 'android'
          ? 'updateViaTheStoreAndroid'
          : 'updateViaTheStore'
      ),
      i18n.t('update_error')
    )
    analytics.capture('update_check_failed', {
      source,
      error_code: 'check_failed',
    })
    errorTracking.captureException(error)
    return 'failed'
  } finally {
    checking = false
  }
}
