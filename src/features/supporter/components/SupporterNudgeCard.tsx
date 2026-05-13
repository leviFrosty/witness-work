import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { faHeart } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Text from '../../../components/MyText'
import Button from '../../../components/Button'
import XView from '../../../components/layout/XView'
import useTheme from '../../../contexts/theme'
import i18n from '../../../lib/locales'
import { usePreferences } from '../../../stores/preferences'
import { RootStackNavigation } from '../../../types/rootStack'

/**
 * Home-screen "thank you" card for long-tenure, high-engagement non-supporters.
 * Visibility is gated by `isSupporterNudgeEligible` in
 * `src/lib/supporterNudge.ts` and wired in `HomeScreen`. Both interactions
 * stamp `supporterNudgeDismissedAt` so the card goes quiet for ~365 days
 * regardless of outcome.
 */
const SupporterNudgeCard = () => {
  const theme = useTheme()
  const { set } = usePreferences()
  const navigation = useNavigation<RootStackNavigation>()

  const stampDismissal = () => {
    set({ supporterNudgeDismissedAt: Date.now() })
  }

  const handleLearnMore = () => {
    stampDismissal()
    navigation.navigate('Paywall')
  }

  return (
    <View
      style={{
        backgroundColor: theme.colors.supporterTranslucent,
        borderColor: theme.colors.supporter,
        borderWidth: 1,
        padding: 20,
        borderRadius: theme.numbers.borderRadiusLg,
        gap: 12,
      }}
    >
      <XView style={{ gap: 8 }}>
        <FontAwesomeIcon
          icon={faHeart}
          size={14}
          color={theme.colors.supporter}
        />
        <Text
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('supporterNudge_title')}
        </Text>
      </XView>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
          lineHeight: 20,
        }}
      >
        {i18n.t('supporterNudge_body')}
      </Text>
      <XView style={{ gap: 10, justifyContent: 'flex-end' }}>
        <Button
          onPress={stampDismissal}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: theme.numbers.borderRadiusMd,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('supporterNudge_dismiss')}
          </Text>
        </Button>
        <Button
          onPress={handleLearnMore}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: theme.numbers.borderRadiusMd,
            backgroundColor: theme.colors.supporter,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textInverse,
            }}
          >
            {i18n.t('supporterNudge_cta')}
          </Text>
        </Button>
      </XView>
    </View>
  )
}

export default SupporterNudgeCard
