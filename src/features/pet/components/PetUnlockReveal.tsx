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
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import FoldPane from '@/components/ui/layout/FoldPane'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { GameButton } from '@/features/pet/components/GameControls'
import { GameFrame, gamePixelScale } from '@/features/pet/components/GamePixels'
import PetUnlockArt from '@/features/pet/components/PetUnlockArt'
import useGamePalette from '@/features/pet/hooks/useGamePalette'
import { unlockText } from '@/features/pet/lib/unlockNews'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { tracking } from '@/lib/tracking'
import type { RoomItemId } from '@/types/pet'

export type PetUnlockRevealAction = 'decorate' | 'done'

const ART_HEIGHT = 150
const ART_WIDTH = 240

export default function PetUnlockReveal({
  item,
  petName,
  onClose,
}: {
  item: RoomItemId
  petName: string

  onClose: (action: PetUnlockRevealAction) => void
}) {
  const theme = useTheme()
  const palette = useGamePalette()
  const scale = gamePixelScale()
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
        <FoldPane
          contentStyle={{
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
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 10 },
              },
              cardStyle,
            ]}
          >
            <GameFrame
              kind='panel'
              palette={palette}
              style={{
                alignItems: 'center',
                gap: 14,
                paddingTop: 24,
                paddingHorizontal: 24,
                paddingBottom: 20,
              }}
            >
              <Animated.View style={artStyle}>
                <GameFrame
                  kind='preview'
                  palette={palette}
                  style={{ padding: 2 * scale }}
                >
                  <PetUnlockArt
                    item={item}
                    size={ART_HEIGHT}
                    width={ART_WIDTH}
                  />
                </GameFrame>
              </Animated.View>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: theme.fonts.semiBold,
                    color: palette.inkAlt,
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
                    color: palette.ink,
                    textAlign: 'center',
                  }}
                >
                  {text.title}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: palette.inkAlt,
                    textAlign: 'center',
                  }}
                >
                  {text.message}
                </Text>
              </View>
              <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 6 }}>
                <GameButton
                  label={
                    hat
                      ? i18n.t('pet.unlock.tryOn')
                      : i18n.t('pet.unlock.decorate')
                  }
                  palette={palette}
                  onPress={() => close('decorate')}
                />
                <GameButton
                  label={i18n.t('done')}
                  kind='soft'
                  palette={palette}
                  onPress={() => close('done')}
                />
              </View>
            </GameFrame>
          </Animated.View>
        </FoldPane>
      </View>
    </FullWindowOverlay>
  )
}
