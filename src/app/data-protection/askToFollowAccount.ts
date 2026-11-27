import { Alert } from 'react-native'
import i18n from '@/lib/locales'
import { applyDataProtectionOn } from '@/app/data-protection/dataProtectionFlows'

export type FollowAnswer = {
  follow: boolean
  step: 'prompt' | 'door_records'
}

export function askToFollowAccount(
  on: boolean,
  answer: (outcome: FollowAnswer) => void
) {
  const decline = () => answer({ follow: false, step: 'prompt' })
  if (on) {
    Alert.alert(
      i18n.t('dataProtectionFollowOnTitle'),
      i18n.t('dataProtectionFollowOnDesc'),
      [
        {
          text: i18n.t('dataProtectionFollowOnDecline'),
          style: 'cancel',
          onPress: decline,
        },
        {
          text: i18n.t('dataProtectionTurnOnAction'),
          isPreferred: true,
          onPress: () =>
            applyDataProtectionOn(
              () => answer({ follow: true, step: 'prompt' }),
              {
                onDecline: () =>
                  answer({ follow: false, step: 'door_records' }),
              }
            ),
        },
      ]
    )
    return
  }
  Alert.alert(
    i18n.t('dataProtectionFollowOffTitle'),
    i18n.t('dataProtectionFollowOffDesc'),
    [
      {
        text: i18n.t('dataProtectionFollowOffDecline'),
        style: 'cancel',
        onPress: decline,
      },
      {
        text: i18n.t('dataProtectionTurnOffAction'),
        style: 'destructive',
        onPress: () => answer({ follow: true, step: 'prompt' }),
      },
    ]
  )
}
