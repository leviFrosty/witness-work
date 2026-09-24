import { useEffect, useState } from 'react'
import * as Notifications from 'expo-notifications'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'

/** Shown only while notification permission isn't granted. */
export default function BuddiesNotificationsCard() {
  const [granted, setGranted] = useState(true)

  useEffect(() => {
    void Notifications.getPermissionsAsync().then((status) =>
      setGranted(status.granted)
    )
  }, [])

  if (granted) return null

  return (
    <Card style={{ gap: 12 }}>
      <Text>{i18n.t('buddies_notificationsOff')}</Text>
      <ActionButton
        onPress={async () => {
          const status = await Notifications.requestPermissionsAsync()
          setGranted(status.granted)
        }}
      >
        {i18n.t('buddies_enableNotifications')}
      </ActionButton>
    </Card>
  )
}
