import { Alert, Platform } from 'react-native'
import * as Updates from 'expo-updates'
import i18n from './locales'
import * as Sentry from 'sentry-expo'
import { RootStackParamList } from '../stacks/RootStack'

export const fetchUpdate = async (
  handleNavigation: (destination: keyof RootStackParamList) => void
) => {
  if (__DEV__) {
    return Alert.alert('Cannot update in dev mode.')
  }

  try {
    const update = await Updates.checkForUpdateAsync()
    if (update.isAvailable) {
      handleNavigation('Update')
    }
    Alert.alert(i18n.t('noUpdateAvailable'))
  } catch (error) {
    Alert.alert(
      `${i18n.t('updateViaThe')} ${
        Platform.OS === 'android' ? 'Play Store' : 'App Store'
      }`,
      `${i18n.t('update_error')} ${error}`
    )
    Sentry.Native.captureException(error)
  }
}
