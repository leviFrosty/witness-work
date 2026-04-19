import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

// Persisted across step unmount/remount. Each step renders its own
// `OnboardingNav`, so without this the shared value would be re-initialized to
// the *new* progress on every mount and never animate from the prior position.
// Module scope is fine here: onboarding only runs in one place, and resetting
// to 0 on a full app reload is the correct fresh-start behavior.
let lastSeenProgress = 0
import { styles } from './Onboarding.styles'
import Text from '../MyText'
import i18n from '../../lib/locales'
import IconButton from '../IconButton'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons'
import Button from '../Button'
import useTheme from '../../contexts/theme'
import { useOnboardingProgress } from './OnboardingProgressContext'

interface Props {
  noActions?: boolean
  goBack: () => void
  /**
   * 1-based index of the current step within the visible onboarding flow. Must
   * be paired with `totalSteps` to render the progress indicator.
   */
  currentStep?: number
  /**
   * Total number of steps the caller wants to represent in the indicator. The
   * nav makes no assumptions about the hero / founder screens — whatever the
   * caller passes is what gets drawn.
   */
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

  // Clamp to [1, totalSteps] so a caller passing a stale index can't break the
  // fill math.
  const clampedStep = showProgress
    ? Math.max(1, Math.min(resolvedCurrent as number, resolvedTotal as number))
    : 0
  const progress = showProgress ? clampedStep / (resolvedTotal as number) : 0

  // Seed from the module-level cache so a fresh mount (step change) animates
  // from the previous step's progress rather than snapping to the new value.
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
      {/*
        Always reserve the indicator's vertical space so the "WitnessWork"
        label sits at the same Y position on every onboarding screen, whether
        the caller opts into the progress indicator or not. This prevents a
        visible jump between hero screens (no indicator) and step screens
        (indicator present).
      */}
      <View style={styles.navProgressSlot}>
        {showProgress ? (
          <View
            // `40` hex = ~25% alpha — semi-transparent variant of textAlt per
            // spec. Applied via hex alpha (not the `opacity` style) so the
            // filled bar inside keeps its full accent color.
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
          <Button style={styles.navBack} onPress={goBack}>
            <IconButton icon={faChevronLeft} />
          </Button>
        ) : null}
        <Text style={styles.navTitle}>{i18n.t('witnessWork')}</Text>
      </View>
    </View>
  )
}

export default OnboardingNav
