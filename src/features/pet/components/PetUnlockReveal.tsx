import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import PetUnlockArt from '@/features/pet/components/PetUnlockArt'
import { unlockText } from '@/features/pet/lib/unlockNews'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { tracking } from '@/lib/tracking'
import type { RoomItemId } from '@/types/pet'

export type PetUnlockRevealAction = 'decorate' | 'done'

const ART_HEIGHT = 150
const ART_WIDTH = 240

/**
 * The full-screen moment for a room item or hat, when the User taps its unlock
 * toast or tray item: a dimmed backdrop and the item in the pet's own room
 * springing in, with a success haptic. "Try it on" (a hat) or "Decorate Room"
 * opens Decorate Room at the item. Still under Reduce Motion.
 */
export default function PetUnlockReveal({
  item,
  petName,
  onClose,
}: {
  item: RoomItemId
  petName: string
  /** The overlay has faded out. */
  onClose: (action: PetUnlockRevealAction) => void
}) {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const appear = useSharedValue(reduceMotion ? 1 : 0)
  const pop = useSharedValue(reduceMotion ? 1 : 0.6)
  const closing = useRef(false)
  const text = unlockText(item, petName)
  const hat = item.startsWith('hat:')

  useEffect(() => {
    Haptics.success().catch(() => {})
    AccessibilityInfo.announceForAccessibility(`${text.eyebrow}, ${text.title}`)
    if (reduceMotion) return
    appear.value = withTiming(1, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    })
    pop.value = withSpring(1, { damping: 11, stiffness: 160 })
  }, [text.eyebrow, text.title, appear, pop, reduceMotion])

  const close = (action: PetUnlockRevealAction) => {
    if (closing.current) return
    closing.current = true
    if (reduceMotion) {
      onClose(action)
      return
    }
    appear.value = withTiming(
      0,
      { duration: 180, easing: Easing.in(Easing.quad) },
      // Closes even when the fade is interrupted, so the card can't get stuck.
      () => scheduleOnRN(onClose, action)
    )
  }

  const backdropStyle = useAnimatedStyle(() => ({ opacity: appear.value }))
  const cardStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [
      { translateY: (1 - appear.value) * 18 },
      { scale: 0.96 + 0.04 * appear.value },
    ],
  }))
  const artStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }))

  return (
    <FullWindowOverlay open onClose={() => close('done')}>
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(0, 0, 0, 0.6)' },
            backdropStyle,
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => close('done')}
            accessible={false}
            importantForAccessibility='no'
          />
        </Animated.View>
        <View
          pointerEvents='box-none'
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Animated.View
            testID='pet-unlock-reveal'
            style={[
              {
                width: '100%',
                maxWidth: 360,
                alignItems: 'center',
                gap: 14,
                paddingTop: 24,
                paddingHorizontal: 24,
                paddingBottom: 20,
                borderRadius: 28,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.card,
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 10 },
                elevation: 12,
              },
              cardStyle,
            ]}
          >
            <Animated.View
              style={[
                {
                  borderRadius: 20,
                  borderCurve: 'continuous',
                  overflow: 'hidden',
                  backgroundColor: theme.colors.backgroundLighter,
                },
                artStyle,
              ]}
            >
              <PetUnlockArt item={item} size={ART_HEIGHT} width={ART_WIDTH} />
            </Animated.View>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.accent,
                  textTransform: 'uppercase',
                  letterSpacing: tracking(1),
                }}
              >
                {text.eyebrow}
              </Text>
              <Text
                accessibilityRole='header'
                style={{
                  fontSize: 21,
                  lineHeight: 27,
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.text,
                  textAlign: 'center',
                }}
              >
                {text.title}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textAlt,
                  textAlign: 'center',
                }}
              >
                {text.message}
              </Text>
            </View>
            <View style={{ alignSelf: 'stretch', gap: 4, marginTop: 6 }}>
              <ActionButton noTransform onPress={() => close('decorate')}>
                {hat
                  ? i18n.t('pet.unlock.tryOn')
                  : i18n.t('pet.unlock.decorate')}
              </ActionButton>
              <Button
                noTransform
                onPress={() => close('done')}
                style={{ alignItems: 'center', paddingVertical: 12 }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t('done')}
                </Text>
              </Button>
            </View>
          </Animated.View>
        </View>
      </View>
    </FullWindowOverlay>
  )
}
