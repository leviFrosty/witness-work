import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import InfoPopover from '@/components/ui/InfoPopover'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'

/** The standing invitation to send Alpha feedback, below the buddies list. */
export default function BuddiesFeedbackCard() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          style={{
            flexShrink: 1,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('lg'),
          }}
        >
          {i18n.t('buddies_alphaHeadline')}
        </Text>
        <InfoPopover
          inline
          title={i18n.t('buddies_alphaInfoTitle')}
          description={i18n.t('buddies_alphaBody')}
        />
      </View>
      <ActionButton
        onPress={() =>
          navigation.navigate('Buddies Feedback', { source: 'card' })
        }
      >
        {i18n.t('buddies_sendFeedback')}
      </ActionButton>
    </Card>
  )
}
