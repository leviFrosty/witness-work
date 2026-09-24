import { Alert } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import { isInviteLink } from '@/features/buddies/lib/inviteLink'
import { MAX_BUDDIES, occupiedBuddySpots } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * For a Buddies Invite link that arrived by message and didn't open the app. A
 * prompt the User pastes into avoids the clipboard-read permission banner.
 */
export default function EnterInviteLink() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const full = useBuddies((state) => occupiedBuddySpots(state) >= MAX_BUDDIES)
  if (full) return null

  const prompt = () =>
    Alert.prompt(
      i18n.t('buddies_enterInviteLink'),
      i18n.t('buddies_enterInviteLink_description'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('buddies_openInvite'),
          onPress: (value?: string) => {
            const link = value?.trim() ?? ''
            if (isInviteLink(link))
              navigation.navigate('Buddy Invite', { link })
            else Alert.alert(i18n.t('buddies_invalidLink'))
          },
        },
      ],
      'plain-text'
    )

  return (
    <Button
      onPress={prompt}
      style={{ alignSelf: 'flex-start', marginTop: -14 }}
    >
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('buddies_haveInvite')}{' '}
        <Text style={{ color: theme.colors.accent }}>
          {i18n.t('buddies_enterInviteLink')}
        </Text>
      </Text>
    </Button>
  )
}
