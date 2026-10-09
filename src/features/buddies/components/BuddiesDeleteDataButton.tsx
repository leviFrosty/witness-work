import { Alert } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { alertBuddiesError } from '@/features/buddies/lib/buddiesErrorAlert'

/** Leaves every buddy and erases this User's Buddies data, after confirming. */
export default function BuddiesDeleteDataButton() {
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
              .catch((error) =>
                alertBuddiesError(i18n.t('buddies_errorDeleteAllTitle'), error)
              ),
        },
      ]
    )

  return (
    <Button onPress={confirmDelete} style={{ alignSelf: 'center' }}>
      <Text style={{ color: theme.colors.error }}>
        {i18n.t('buddies_deleteAll')}
      </Text>
    </Button>
  )
}
