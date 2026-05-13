import { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated'
import Text from '../../../../components/MyText'
import i18n from '../../../../lib/locales'
import Wrapper from '../../../../components/layout/Wrapper'
import ActionButton from '../../../../components/ActionButton'
import Button from '../../../../components/Button'
import useTheme from '../../../../contexts/theme'

interface Props {
  goNext: () => void
  goBack?: () => void
  goToStep?: (stepId: 'iCloudRestore') => void
}

const EASE_OUT = Easing.out(Easing.cubic)

interface WordProps {
  word: string
  delay: number
  color: string
}

const TaglineWord = ({ word, delay, color }: WordProps) => {
  const opacity = useSharedValue(0)
  const translateY = useSharedValue(22)

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 480, easing: EASE_OUT })
    )
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 480, easing: EASE_OUT })
    )
  }, [delay, opacity, translateY])

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))

  return (
    <Animated.Text style={[styles.taglineWord, { color }, style]}>
      {word}{' '}
    </Animated.Text>
  )
}

const StepOne = ({ goNext, goToStep }: Props) => {
  const theme = useTheme()

  const taglineWords = i18n
    .t('onboardingHeroTagline')
    .split(/\s+/)
    .filter(Boolean)

  const glowOpacity = useSharedValue(0)
  const glowScale = useSharedValue(0.6)

  const brandOpacity = useSharedValue(0)
  const brandScale = useSharedValue(0.88)
  const brandTranslateY = useSharedValue(28)

  const accentLineWidth = useSharedValue(0)
  const accentLineOpacity = useSharedValue(0)

  const buttonsOpacity = useSharedValue(0)
  const buttonsTranslateY = useSharedValue(36)

  useEffect(() => {
    // Ambient glow blooms in
    glowOpacity.value = withTiming(1, { duration: 900, easing: EASE_OUT })
    glowScale.value = withTiming(1, { duration: 1200, easing: EASE_OUT })

    // Brand name rises in
    brandOpacity.value = withDelay(
      280,
      withTiming(1, { duration: 650, easing: EASE_OUT })
    )
    brandScale.value = withDelay(
      280,
      withSpring(1, { damping: 22, stiffness: 140 })
    )
    brandTranslateY.value = withDelay(
      280,
      withTiming(0, { duration: 650, easing: EASE_OUT })
    )

    // Accent line draws out after tagline settles
    // tagline last word: 880 + 2*170 = 1220ms start, +480ms = 1700ms done
    accentLineOpacity.value = withDelay(1750, withTiming(1, { duration: 300 }))
    accentLineWidth.value = withDelay(
      1750,
      withTiming(48, { duration: 500, easing: EASE_OUT })
    )

    // Buttons slide up after accent line
    buttonsOpacity.value = withDelay(
      2050,
      withTiming(1, { duration: 550, easing: EASE_OUT })
    )
    buttonsTranslateY.value = withDelay(
      2050,
      withTiming(0, { duration: 550, easing: EASE_OUT })
    )
  }, [
    glowOpacity,
    glowScale,
    brandOpacity,
    brandScale,
    brandTranslateY,
    accentLineOpacity,
    accentLineWidth,
    buttonsOpacity,
    buttonsTranslateY,
  ])

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }))

  const brandStyle = useAnimatedStyle(() => ({
    opacity: brandOpacity.value,
    transform: [
      { scale: brandScale.value },
      { translateY: brandTranslateY.value },
    ],
  }))

  const accentLineStyle = useAnimatedStyle(() => ({
    opacity: accentLineOpacity.value,
    width: accentLineWidth.value,
  }))

  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsTranslateY.value }],
  }))

  const handleReturningUser = () => {
    if (goToStep) {
      goToStep('iCloudRestore')
      return
    }
    goNext()
    goNext()
  }

  return (
    <Wrapper
      style={{
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 100,
        overflow: 'hidden',
      }}
    >
      {/* Ambient glow orb */}
      <Animated.View
        style={[
          styles.glowOrb,
          { backgroundColor: theme.colors.accentTranslucent },
          glowStyle,
        ]}
        pointerEvents='none'
      />

      {/* Main content */}
      <View style={styles.contentArea}>
        {/* Brand name */}
        <Animated.View style={brandStyle}>
          <Text style={[styles.brandName, { color: theme.colors.accent }]}>
            {i18n.t('witnessWork')}
          </Text>
        </Animated.View>

        {/* Tagline — word-by-word stagger */}
        <View style={styles.taglineRow}>
          {taglineWords.map((word, i) => (
            <TaglineWord
              key={`${i}-${word}`}
              word={word}
              delay={880 + i * 170}
              color={theme.colors.text}
            />
          ))}
        </View>

        {/* Accent mark */}
        <Animated.View
          style={[
            styles.accentLine,
            { backgroundColor: theme.colors.accent },
            accentLineStyle,
          ]}
        />
      </View>

      {/* CTA buttons — revealed after animations */}
      <Animated.View style={buttonsStyle}>
        <ActionButton onPress={goNext}>{i18n.t('getStarted')}</ActionButton>
        <View style={styles.returningUserRow}>
          <Button onPress={handleReturningUser}>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textAlt,
                textDecorationLine: 'underline',
              }}
            >
              {i18n.t('onboardingHeroReturningLink')}
            </Text>
          </Button>
        </View>
      </Animated.View>
    </Wrapper>
  )
}

const styles = StyleSheet.create({
  glowOrb: {
    position: 'absolute',
    top: -180,
    alignSelf: 'center',
    width: 500,
    height: 500,
    borderRadius: 250,
  },
  contentArea: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 60,
  },
  brandName: {
    fontSize: 44,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
    marginBottom: 14,
  },
  taglineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 28,
  },
  taglineWord: {
    fontSize: 36,
    lineHeight: 50,
    fontFamily: 'Inter_700Bold',
  },
  accentLine: {
    height: 4,
    borderRadius: 2,
  },
  returningUserRow: {
    alignItems: 'center',
    marginTop: 16,
  },
})

export default StepOne
