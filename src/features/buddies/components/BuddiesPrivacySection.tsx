import { Alert } from 'react-native'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'

/** Delete-my-data wipes the relay inbox and the synced seed everywhere. */
export default function BuddiesPrivacySection() {
  const theme = useTheme()

  const confirmDelete = () =>
    Alert.alert(
      i18n.t('buddies_deleteAllTitle'),
      i18n.t('buddies_deleteAllBody'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('buddies_delete'),
          style: 'destructive',
          onPress: () =>
            buddiesEngine
              .deleteEverything()
              .catch((error) => Alert.alert(buddiesErrorMessage(error))),
        },
      ]
    )

  return (
    <Card style={{ gap: 10 }}>
      <Text style={{ fontFamily: theme.fonts.semiBold }}>
        {i18n.t('buddies_privacy')}
      </Text>
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('buddies_intro')}
      </Text>
      <Button onPress={confirmDelete} style={{ alignSelf: 'flex-start' }}>
        <Text style={{ color: theme.colors.error }}>
          {i18n.t('buddies_deleteAll')}
        </Text>
      </Button>
    </Card>
  )
}
