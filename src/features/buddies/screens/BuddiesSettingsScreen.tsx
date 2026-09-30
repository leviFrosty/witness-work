import { ScrollView } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import BuddiesDeleteDataButton from '@/features/buddies/components/BuddiesDeleteDataButton'
import BuddiesNotificationsSection from '@/features/buddies/components/BuddiesNotificationsSection'
import BuddiesSharingSection from '@/features/buddies/components/BuddiesSharingSection'

/** What buddies see, Buddies notifications here, and deleting everything. */
export default function BuddiesSettingsScreen() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          gap: 24,
          paddingVertical: 24,
          paddingHorizontal: 15,
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
        }}
      >
        <BuddiesSharingSection />
        <BuddiesNotificationsSection />
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
      </ScrollView>
    </Wrapper>
  )
}
