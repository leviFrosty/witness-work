import { useEffect } from 'react'
import { analytics } from '@/lib/analytics'
import { Heart as HeartIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import XView from '@/components/ui/layout/XView'
import ContextMenu from '@/components/ui/ContextMenu'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { RootStackNavigation } from '@/types/rootStack'
import SupporterCtaButton from '@/features/supporter/components/SupporterCtaButton'

/**
 * Home-screen "thank you" card for long-tenure, high-engagement non-supporters.
 * Visibility is gated by `isSupporterNudgeEligible` in
 * `src/features/supporter/lib/supporterNudge.ts` and wired in `HomeScreen`.
 * Both interactions stamp `supporterNudgeDismissedAt` so the card goes quiet
 * for ~365 days regardless of outcome.
 */
const SupporterNudgeCard = () => {
  const theme = useTheme()
  const { set } = usePreferences()
  const navigation = useNavigation<RootStackNavigation>()

  const isFocused = useIsFocused()
  useEffect(() => {
    if (!isFocused) return
    analytics.capture('supporter_nudge_viewed', { source: 'home' })
  }, [isFocused])

  const stampDismissal = () => {
    set({ supporterNudgeDismissedAt: Date.now() })
  }

  const handleLearnMore = () => {
    stampDismissal()
    analytics.capture('supporter_nudge_clicked', { source: 'home' })
    analytics.capture('paywall_opened', { source: 'home_nudge' })
    navigation.navigate('Paywall', { source: 'home_nudge' })
  }

  const handleNotNow = () => {
    analytics.capture('supporter_nudge_dismissed', { source: 'home' })
    stampDismissal()
  }

  // Same as the Settings switch (Preferences → Home Screen).
  const handleDontShowAgain = () => {
    analytics.capture('supporter_nudge_visibility_changed', {
      hidden: true,
      source: 'home_nudge',
    })
    set({ hideSupporterNudge: true })
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
      {/* The message is long-pressable; the buttons below stay outside it. */}
      <ContextMenu
        analyticsSurface='supporter_nudge'
        actions={[
          [
            {
              id: 'learn_more',
              title: i18n.t('learnMore'),
              systemImage: 'heart',
              onPress: handleLearnMore,
            },
          ],
          [
            {
              id: 'not_now',
              title: i18n.t('notRightNow'),
              systemImage: 'clock',
              onPress: handleNotNow,
            },
            {
              id: 'dont_show_again',
              title: i18n.t('dontShowAgain'),
              systemImage: 'eye.slash',
              onPress: handleDontShowAgain,
            },
          ],
        ]}
      >
        <View style={{ gap: 12 }}>
          <XView style={{ gap: 8 }}>
            <LucideIcon
              icon={HeartIcon}
              size={14}
              color={theme.colors.supporter}
              fill={theme.colors.supporter}
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
        </View>
      </ContextMenu>
      <XView style={{ gap: 10, justifyContent: 'flex-end' }}>
        <Button
          onPress={handleNotNow}
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
        <SupporterCtaButton
          onPress={handleLearnMore}
          shimmer
          style={{
            paddingVertical: 8,
            paddingHorizontal: 14,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              // Gold supporter fill needs a dark foreground in both themes —
              // textInverse flips to white in light mode and fails contrast.
              color: '#343232',
            }}
          >
            {i18n.t('supporterNudge_cta')}
          </Text>
        </SupporterCtaButton>
      </XView>
    </View>
  )
}

export default SupporterNudgeCard
