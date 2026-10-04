import { Alert, Platform } from 'react-native'
import * as Updates from 'expo-updates'
import i18n from '@/lib/locales'
import { errorTracking } from '@/lib/errorTracking'
import { RootStackParamList } from '@/types/rootStack'

type UpdateCheckOutcome =
  | 'available'
  | 'up_to_date'
  | 'unavailable'
  | 'failed'
  | 'busy'
let checking = false

export const fetchUpdate = async (
  handleNavigation: (destination: keyof RootStackParamList) => void
): Promise<UpdateCheckOutcome> => {
  if (checking) return 'busy'
  if (__DEV__ || !Updates.isEnabled) {
    Alert.alert(i18n.t('updatesUnavailable'))

    return 'unavailable'
  }

  checking = true

  try {
    const update = await Updates.checkForUpdateAsync()
    if (update.isAvailable) {
      handleNavigation('Update')

      return 'available'
    }
    Alert.alert(i18n.t('noUpdateAvailable'))

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

    errorTracking.captureException(error)
    return 'failed'
  } finally {
    checking = false
  }
}
