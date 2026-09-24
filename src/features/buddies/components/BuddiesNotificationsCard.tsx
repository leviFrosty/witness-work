import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import useNotificationPermission from '@/features/buddies/hooks/useNotificationPermission'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Asks for notifications only while someone may accept or confirm, since that's
 * when a missed push leaves a request waiting.
 */
export default function BuddiesNotificationsCard() {
  const { granted, needsSettings, turnOn } = useNotificationPermission()
  const enabled = useBuddies((state) => state.notificationsEnabled)
  const waiting = useBuddies(
    (state) =>
      state.outgoingInvites.length > 0 ||
      state.buddies.some((buddy) => buddy.status === 'awaitingConfirm')
  )

  if (granted !== false || !enabled || !waiting) return null

  return (
    <Card style={{ gap: 12 }}>
      <Text>{i18n.t('buddies_notificationsOff')}</Text>
      <ActionButton onPress={turnOn}>
        {i18n.t(
          needsSettings ? 'buddies_openSettings' : 'buddies_enableNotifications'
        )}
      </ActionButton>
    </Card>
  )
}
