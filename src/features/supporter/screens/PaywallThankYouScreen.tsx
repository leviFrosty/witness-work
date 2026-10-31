import { useEffect, useEffectEvent, useRef } from 'react'
import { Platform, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import SupporterBenefits from '@/components/SupporterBenefits'
import SupporterBadge from '@/components/SupporterBadge'
import useIsSupporter from '@/hooks/useIsSupporter'
import useAccount from '@/hooks/useAccount'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import useAnimation from '@/hooks/useAnimation'
import useFireworks from '@/hooks/useFireworks'
import { FIREWORKS_AFTER_LOTTIE_BUFFER_MS } from '@/providers/ConfettiProvider'
import {
  CONFETTI_DELAY_MS,
  CONFETTI_DURATION,
} from '@/providers/AnimationViewProvider'
import Haptics from '@/lib/haptics'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

const PAYWALL_FIREWORKS_OPTS = {
  count: 36,
  velocity: 280,
  spots: [
    { x: 0.15, y: 0.25 },
    { x: 0.85, y: 0.25 },
    { x: 0.5, y: 0.18 },
    { x: 0.3, y: 0.45 },
    { x: 0.7, y: 0.45 },
    { x: 0.5, y: 0.55 },
    { x: 0.5, y: 0.35 },
  ],
}

const PaywallThankYouScreen = () => {
  const foldColumn2 = useFoldColumn(680)
  const foldColumn = useFoldColumn(640)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const route = useRoute<RouteProp<RootStackParamList, 'Thank You'>>()
  const { isSupporter } = useIsSupporter()
  const { iCloudSharingAvailable } = useAccount()
  // Prefer the just-purchased tier from nav params over the current supporter
  // state. A lifetime supporter who sends a one-time tip is still
  // `isSupporter === true`, but the screen tone should match what they
  // actually bought. Falls back to `isSupporter` when the screen is reached
  // without a tier (e.g. legacy nav paths).
  const purchaseTier = route.params?.purchaseTier
  const showSupporterCelebration = purchaseTier
    ? purchaseTier === 'supporter'
    : isSupporter
  const canGoBack = navigation.canGoBack()
  const { playConfetti } = useAnimation()
  const fireworks = useFireworks()

  // Starting the confetti hands back a new `playConfetti`, so the celebration
  // can't re-run on its identity: that would clear the fireworks timer.
  const hasCelebratedRef = useRef(false)
  const celebrate = useEffectEvent(() => {
    if (hasCelebratedRef.current) return
    hasCelebratedRef.current = true
    playConfetti()
    Haptics.heavy()
  })
  const fireFireworks = useEffectEvent(() =>
    fireworks.fire(PAYWALL_FIREWORKS_OPTS)
  )
  useEffect(() => {
    celebrate()
    const buffer =
      CONFETTI_DELAY_MS + CONFETTI_DURATION + FIREWORKS_AFTER_LOTTIE_BUFFER_MS
    const timer = setTimeout(() => fireFireworks(), buffer)
    return () => clearTimeout(timer)
  }, [])

  return (
    <Wrapper
      insets='top'
      style={{
        flex: 1,
        gap: 10,
        justifyContent: 'space-between',
        position: 'relative',
      }}
    >
      <ScrollView
        // Must flex — RN 0.86's Yoga no longer clamps an unflexed ScrollView
        // to its parent's bounds, so without this the scroll area sizes to
        // its content and pushes the footer button off-screen.
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 30,
          paddingHorizontal: 20,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            { width: '100%', maxWidth: 640, alignSelf: 'center' },
            foldColumn,
          ]}
        >
          <View
            style={{
              alignItems: 'center',
              gap: 16,
              paddingTop: 20,
              paddingBottom: 30,
            }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('4xl'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('thankYou')}
            </Text>

            {showSupporterCelebration && <SupporterBadge size='md' />}

            <Text style={{ textAlign: 'center', maxWidth: 280 }}>
              {showSupporterCelebration
                ? i18n.t('thankYou_description')
                : i18n.t(
                    // Web copy never says donate (docs/web-purchases.md).
                    Platform.OS === 'web'
                      ? 'thankYou_oneTimeDescriptionWeb'
                      : 'thankYou_oneTimeDescription'
                  )}
            </Text>
            {showSupporterCelebration && (
              <Text
                style={{
                  textAlign: 'center',
                  maxWidth: 280,
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('thankYou_benefitsIntro')}
              </Text>
            )}
          </View>

          {showSupporterCelebration && <SupporterBenefits />}

          {/*
           * With iCloud reachable (or Google Drive connected on Android),
           * Supporter status reaches the user's other devices automatically
           * (ADR 0011) — say nothing. Only when it can't (signed out, iCloud
           * Drive disabled for WitnessWork, Drive not connected) does the user
           * have something to do, so only then surface the manual path.
           */}
          {/* The web's purchases follow the account to every device. */}
          {showSupporterCelebration &&
            !iCloudSharingAvailable &&
            Platform.OS !== 'web' && (
              <Card style={{ marginTop: 15 }}>
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('thankYou_multiDeviceTitle')}
                </Text>
                <Text
                  style={{
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t(
                    Platform.OS === 'android'
                      ? 'thankYou_multiDeviceBodyAndroid'
                      : 'thankYou_multiDeviceBody'
                  )}
                </Text>
              </Card>
            )}
        </View>
      </ScrollView>
      <View
        style={[
          {
            width: '100%',
            maxWidth: 680,
            alignSelf: 'center',
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 16,
          },
          foldColumn2,
        ]}
      >
        <ActionButton
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack()
            } else {
              navigation.navigate('Root', undefined, { pop: true })
            }
          }}
        >
          {canGoBack ? i18n.t('goBack') : i18n.t('goHome')}
        </ActionButton>
      </View>
    </Wrapper>
  )
}

export default PaywallThankYouScreen
