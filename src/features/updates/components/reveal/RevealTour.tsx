import { useEffect, useState } from 'react'
import { LayoutChangeEvent, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { X as XIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { shareApp } from '@/lib/shareApp'
import { DISPLAY_FONT_SCALE_CAP } from '@/features/onboarding/constants/welcome'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import WelcomeCta from '@/features/onboarding/components/welcome/WelcomeCta'
import {
  RevealMoreTile,
  RevealPage,
} from '@/features/updates/hooks/useRevealPages'
import RevealTourPage from '@/features/updates/components/reveal/RevealTourPage'

interface Props {
  pages: RevealPage[]
  moreTiles: RevealMoreTile[]
  palette: WelcomePalette
  time: SharedValue<number>
  reduceMotion: boolean
  /** A page came on screen. */
  onPageViewed: (id: string) => void
  onDone: () => void
  onClose: () => void
}

/**
 * The update's tour: a page per feature, swiped or stepped through with Next.
 * It ends on sharing the app with friends on Android, so that page's main
 * action is Share, with Done beneath it.
 */
const RevealTour = ({
  pages,
  moreTiles,
  palette,
  time,
  reduceMotion,
  onPageViewed,
  onDone,
  onClose,
}: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [index, setIndex] = useState(0)
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollX = useSharedValue(0)
  const last = index === pages.length - 1
  const pageId = pages[index]?.id

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x
  })
  // The page under the middle of the screen is the current one, whether it got
  // there by a swipe or by Next.
  useAnimatedReaction(
    () => (width > 0 ? Math.round(scrollX.value / width) : 0),
    (now, before) => {
      if (now !== before) scheduleOnRN(setIndex, now)
    }
  )

  useEffect(() => {
    if (pageId) onPageViewed(pageId)
  }, [pageId, onPageViewed])

  const next = () => {
    if (last) return
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true })
  }

  const linkStyle = useAnimatedStyle(() => ({
    opacity: withTiming(last ? 1 : 0, { duration: 250 }),
  }))

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top + 8,
        paddingBottom: Math.max(insets.bottom, 20),
      }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingLeft: 24,
          paddingRight: 12,
        }}
      >
        <View
          accessible
          accessibilityRole='progressbar'
          accessibilityLabel={i18n.t('updateReveal_pageOf', {
            page: index + 1,
            count: pages.length,
          })}
          style={{ flex: 1, flexDirection: 'row', gap: 6 }}
        >
          {pages.map((page, i) => (
            <Segment
              key={page.id}
              filled={i <= index}
              palette={palette}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>
        <Button
          onPress={onClose}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('close')}
          hitSlop={10}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.surfaceBorder,
          }}
        >
          <LucideIcon icon={XIcon} size={17} color={palette.text} />
        </Button>
      </View>

      <View
        style={{ flex: 1 }}
        onLayout={(e: LayoutChangeEvent) =>
          setHeight(e.nativeEvent.layout.height)
        }
      >
        {width > 0 && height > 0 && (
          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
          >
            {pages.map((page, i) => (
              <RevealTourPage
                key={page.id}
                page={page}
                index={i}
                width={width}
                height={height}
                scrollX={scrollX}
                active={i === index}
                palette={palette}
                moreTiles={moreTiles}
                reduceMotion={reduceMotion}
              />
            ))}
          </Animated.ScrollView>
        )}
      </View>

      <View
        style={{
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
          paddingHorizontal: 24,
          paddingTop: 24,
        }}
      >
        <WelcomeCta
          label={i18n.t(last ? 'updateReveal_shareLink' : 'updateReveal_next')}
          onPress={last ? () => shareApp('update_reveal') : next}
          time={time}
          palette={palette}
          reduceMotion={reduceMotion}
        />
        <Animated.View
          style={[{ marginTop: 10, alignItems: 'center' }, linkStyle]}
          pointerEvents={last ? 'auto' : 'none'}
        >
          <Button
            onPress={onDone}
            accessibilityRole='button'
            accessibilityElementsHidden={!last}
            importantForAccessibility={last ? 'auto' : 'no-hide-descendants'}
            style={{ paddingVertical: 10, paddingHorizontal: 16 }}
          >
            <Text
              maxFontSizeMultiplier={DISPLAY_FONT_SCALE_CAP}
              style={{
                fontSize: 15,
                fontFamily: theme.fonts.medium,
                color: palette.textAlt,
              }}
            >
              {i18n.t('done')}
            </Text>
          </Button>
        </Animated.View>
      </View>
    </View>
  )
}

/** One step of the tour's progress, filling as it's reached. */
const Segment = ({
  filled,
  palette,
  reduceMotion,
}: {
  filled: boolean
  palette: WelcomePalette
  reduceMotion: boolean
}) => {
  const fill = useSharedValue(filled ? 1 : 0)
  useEffect(() => {
    fill.value = withTiming(filled ? 1 : 0, {
      duration: reduceMotion ? 0 : 380,
    })
  }, [filled, fill, reduceMotion])
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }))
  return (
    <View
      style={{
        flex: 1,
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
        backgroundColor: palette.skeleton,
      }}
    >
      <Animated.View
        style={[{ height: '100%', backgroundColor: palette.text }, fillStyle]}
      />
    </View>
  )
}

export default RevealTour
