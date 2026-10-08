import { Alert } from 'react-native'
import { calendarAction, disconnectCalendar } from '@/app/calendar/calendarSync'
import i18n from '@/lib/locales'

/**
 * Only the primary can remove the events it published, so it asks keep or
 * remove. Elsewhere turning off only stops this device and the events stay.
 */
export function confirmDisconnectCalendar({
  isPrimary,
  source,
}: {
  isPrimary: boolean
  source: 'settings' | 'tray'
}) {
  const run = (remove: boolean) => {
    void calendarAction(() => disconnectCalendar(remove, source)).catch(
      () => undefined
    )
  }
  const cancel = { text: i18n.t('cancel'), style: 'cancel' as const }
  if (!isPrimary) {
    Alert.alert(
      i18n.t('calendarTurnOffTitle'),
      i18n.t('calendarTurnOffKeepsEvents'),
      [cancel, { text: i18n.t('calendarTurnOff'), onPress: () => run(false) }]
    )
    return
  }
  Alert.alert(i18n.t('calendarTurnOffTitle'), i18n.t('calendarTurnOffChoice'), [
    cancel,
    { text: i18n.t('calendarKeepEvents'), onPress: () => run(false) },
    {
      text: i18n.t('calendarRemoveEvents'),
      style: 'destructive',
      onPress: () => run(true),
    },
  ])
}
