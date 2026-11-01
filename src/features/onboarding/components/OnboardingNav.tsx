import { ChevronBackwardIcon } from '@/components/ui/DirectionalIcon'
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

let lastSeenProgress = 0
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import { useOnboardingProgress } from '@/features/onboarding/components/OnboardingProgressContext'

interface Props {
  noActions?: boolean
  goBack: () => void

  currentStep?: number

  totalSteps?: number
}

const OnboardingNav = ({
  noActions,
  goBack,
  currentStep,
  totalSteps,
}: Props) => {
  const theme = useTheme()
  const progressCtx = useOnboardingProgress()

  const resolvedCurrent = currentStep ?? progressCtx.currentStep
  const resolvedTotal = totalSteps ?? progressCtx.totalSteps

  const showProgress =
    typeof resolvedCurrent === 'number' &&
    typeof resolvedTotal === 'number' &&
    resolvedTotal > 0

  const clampedStep = showProgress
    ? Math.max(1, Math.min(resolvedCurrent as number, resolvedTotal as number))
    : 0
  const progress = showProgress ? clampedStep / (resolvedTotal as number) : 0

  const progressValue = useSharedValue(lastSeenProgress)

  useEffect(() => {
    progressValue.value = withTiming(progress, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    })
    lastSeenProgress = progress
  }, [progress, progressValue])

  const fillAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressValue.value * 100}%`,
  }))

  return (
    <View style={styles.navContainer}>
      {}
      <View style={styles.navProgressSlot}>
        {showProgress ? (
          <View
            style={[
              styles.navProgressTrack,
              { backgroundColor: `${theme.colors.textAlt}40` },
            ]}
            accessibilityRole='progressbar'
            accessibilityValue={{
              min: 0,
              max: resolvedTotal,
              now: clampedStep,
            }}
          >
            <Animated.View
              style={[
                styles.navProgressFill,
                { backgroundColor: theme.colors.accent },
                fillAnimatedStyle,
              ]}
            />
          </View>
        ) : null}
      </View>
      <View style={styles.navTitleRow}>
        {!noActions ? (
          <Button
            variant='outline'
            style={styles.navBack}
            onPress={goBack}
            hitSlop={24}
            accessibilityRole='button'
            accessibilityLabel={i18n.t('goBack')}
          >
            <ChevronBackwardIcon color={theme.colors.text} size={22} />
          </Button>
        ) : null}
        <Text style={[styles.navTitle, { fontFamily: theme.fonts.bold }]}>
          {i18n.t('witnessWork')}
        </Text>
      </View>
    </View>
  )
}

export default OnboardingNav
