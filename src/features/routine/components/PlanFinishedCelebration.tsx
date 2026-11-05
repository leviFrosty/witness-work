import { useEffect } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet } from 'react-native'
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated'
import { BookOpenCheck as BookOpenCheckIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import FoldPane from '@/components/ui/layout/FoldPane'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { PlanCelebration } from '@/features/routine/stores/planCelebration'

const GOLD = '#FACC15'

export default function PlanFinishedCelebration({
  celebration,
  onDone,
}: {
  celebration: PlanCelebration
  onDone: () => void
}) {
  const theme = useTheme()
  const title = i18n.t('routine.celebration.title')
  const caption = i18n.t('routine.celebration.caption', {
    count: celebration.days,
  })
  const coins =
    celebration.coins === null
      ? null
      : i18n.t('routine.celebration.coins', {
          coins: i18n.t('pet.currency.coin' as TranslationKey, {
            count: celebration.coins,
          }),
        })

  useEffect(() => {
    void Haptics.success().catch(() => {})
    AccessibilityInfo.announceForAccessibility(
      [title, caption, coins].filter(Boolean).join('. ')
    )
  }, [title, caption, coins])

  return (
    <FullWindowOverlay open onClose={onDone}>
      <Animated.View
        entering={FadeIn.duration(260)}
        accessibilityViewIsModal
        style={[StyleSheet.absoluteFill, styles.backdrop]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDone}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('close')}
        />
        <FoldPane contentStyle={styles.content} pointerEvents='box-none'>
          <Animated.View entering={ZoomIn.delay(120).springify()}>
            <LucideIcon
              icon={BookOpenCheckIcon}
              size={112}
              strokeWidth={1.6}
              color={GOLD}
            />
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(420)}>
            <Text style={[styles.title, { fontFamily: theme.fonts.bold }]}>
              {title}
            </Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(560)}>
            <Text style={[styles.caption, { fontFamily: theme.fonts.medium }]}>
              {caption}
            </Text>
          </Animated.View>
          {coins ? (
            <Animated.View entering={FadeInDown.delay(700)}>
              <Text
                style={[
                  styles.caption,
                  { fontFamily: theme.fonts.semiBold, color: GOLD },
                ]}
              >
                {coins}
              </Text>
            </Animated.View>
          ) : null}
          <Animated.View entering={FadeInDown.delay(860)} style={styles.done}>
            <Button
              accessibilityRole='button'
              onPress={onDone}
              testID='routine-celebration-done'
              style={{
                minHeight: MIN_TOUCH_TARGET,
                minWidth: 160,
                paddingHorizontal: 24,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.numbers.borderRadiusMd,
                backgroundColor: theme.colors.accent,
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.textInverse,
                }}
              >
                {i18n.t('routine.celebration.done')}
              </Text>
            </Button>
          </Animated.View>
        </FoldPane>
      </Animated.View>
    </FullWindowOverlay>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(6, 8, 12, 0.88)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    textAlign: 'center',
    marginTop: 16,
  },
  caption: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 17,
    textAlign: 'center',
  },
  done: {
    marginTop: 24,
  },
})
