import { NativeStackScreenProps } from '@react-navigation/native-stack'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackParamList } from '@/types/rootStack'
import BuddiesDeleteDataButton from '@/features/buddies/components/BuddiesDeleteDataButton'
import BuddiesSettingsRows from '@/features/buddies/components/BuddiesSettingsRows'
import BuddySettingsScreenFrame from '@/features/buddies/components/BuddySettingsScreenFrame'

type Props = NativeStackScreenProps<RootStackParamList, 'Buddies Settings'>

export default function BuddiesSettingsScreen({ navigation }: Props) {
  const theme = useTheme()
  return (
    <BuddySettingsScreenFrame
      title={i18n.t('buddies_settingsTitle')}
      footer={(buddy) =>
        !buddy && (
          <>
            <Button
              onPress={() =>
                navigation.navigate('Buddies Feedback', { source: 'settings' })
              }
              style={{ alignSelf: 'center' }}
            >
              <Text style={{ color: theme.colors.accent }}>
                {i18n.t('buddies_sendFeedback')}
              </Text>
            </Button>
            <BuddiesDeleteDataButton />
          </>
        )
      }
    >
      {() => <BuddiesSettingsRows />}
    </BuddySettingsScreenFrame>
  )
}
