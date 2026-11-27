import { Alert } from 'react-native'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import {
  clearAllDoorRecords,
  territoriesWithDoorRecords,
} from '@/features/territories/lib/doorRecordPrivacy'

type Outcome = { onDecline?: () => void }

export function beforeDoorRecordsGo(
  apply: () => void,
  {
    alsoTerritory = false,
    onDecline,
  }: Outcome & { alsoTerritory?: boolean } = {}
) {
  const count = territoriesWithDoorRecords()
  if (count === 0) return apply()
  confirmDestructive({
    title: i18n.t('territories.privacyConfirm_title'),
    description: [
      alsoTerritory && i18n.t('territories.privacyConfirm_alsoTerritory'),
      i18n.t('territories.privacyConfirm_description', { count }),
    ]
      .filter(Boolean)
      .join(' '),
    confirmLabel: i18n.t('territories.privacyConfirm_action'),
    onConfirm: () => {
      apply()
      clearAllDoorRecords()
    },
    onCancel: onDecline,
  })
}

export function applyDataProtectionOn(
  apply: () => void,
  outcome: Outcome = {}
) {
  if (usePreferences.getState().territoryPrivacyMode === null)
    beforeDoorRecordsGo(apply, { alsoTerritory: true, ...outcome })
  else apply()
}

export function confirmDataProtectionOff(apply: () => void) {
  Alert.alert(
    i18n.t('dataProtectionTurnOffTitle'),
    i18n.t('dataProtectionTurnOffDesc'),
    [
      { text: i18n.t('cancel'), style: 'cancel' },
      {
        text: i18n.t('dataProtectionTurnOffAction'),
        style: 'destructive',
        onPress: apply,
      },
    ]
  )
}
