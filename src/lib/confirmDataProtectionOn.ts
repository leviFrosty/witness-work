import { Alert } from 'react-native'

import i18n from '@/lib/locales'

const confirmDataProtectionOn = (onConfirm: () => void) => {
  Alert.alert(
    i18n.t('dataProtectionTurnOnTitle'),
    i18n.t('dataProtectionTurnOnDesc'),
    [
      { text: i18n.t('cancel'), style: 'cancel' },
      {
        text: i18n.t('dataProtectionTurnOnAction'),
        style: 'destructive',
        onPress: onConfirm,
      },
    ]
  )
}

export default confirmDataProtectionOn
