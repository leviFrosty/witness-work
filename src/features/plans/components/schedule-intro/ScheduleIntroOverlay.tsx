import { useEffect, useRef, useState } from 'react'
import { LayoutChangeEvent, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import Animated, {
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import {
  CalendarDays as CalendarDaysIcon,
  Flame as FlameIcon,
  Hourglass as HourglassIcon,
  Users as UsersIcon,
  X as XIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { StreakKind } from '@/lib/serviceStreak'
import { usePreferences } from '@/stores/preferences'
import {
  useScheduleIntro,
  type ScheduleIntroSource,
} from '@/stores/scheduleIntro'
import type { RootStackNavigation } from '@/types/rootStack'
import { DISPLAY_FONT_SCALE_CAP } from '@/features/onboarding/constants/welcome'
import useWelcomeMotion from '@/features/onboarding/hooks/useWelcomeMotion'
import {
  getWelcomePalette,
  WelcomePalette,
} from '@/features/onboarding/lib/welcomePalette'
import WelcomeCta from '@/features/onboarding/components/welcome/WelcomeCta'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import ScheduleIntroPage, {
  type ScheduleIntroPageSpec,
} from '@/features/plans/components/schedule-intro/ScheduleIntroPage'

/** How the intro was closed. Bounded, safe as an analytics value. */
type CloseMethod = 'plan' | 'done' | 'close' | 'back'

/**
 * The intro's pages. Streak pages read by what the role's streak counts; the
 * Buddies page shows only where Buddies does.
 */
function introPages(
  colors: ReturnType<typeof useTheme>['colors'],
  kind: StreakKind,
  buddies: boolean
): ScheduleIntroPageSpec[] {
  const months = kind === 'months'
  const pages: ScheduleIntroPageSpec[] = [
    {
      id: 'plan',
      icon: CalendarDaysIcon,
      color: colors.accent,
      title: i18n.t('scheduleIntro_plan_title'),
      caption: i18n.t('scheduleIntro_plan_caption'),
    },
    {
      id: 'streak',
      icon: FlameIcon,
      color: colors.orange,
      title: i18n.t('scheduleIntro_streak_title'),
      caption: i18n.t(
        months
          ? 'scheduleIntro_streak_captionMonths'
          : 'scheduleIntro_streak_caption'
      ),
    },
    {
      id: 'grace',
      icon: HourglassIcon,
      color: colors.warn,
      title: i18n.t('scheduleIntro_grace_title'),
      caption: i18n.t(
        months
          ? 'scheduleIntro_grace_captionMonths'
          : 'scheduleIntro_grace_caption'
      ),
    },
  ]
  if (buddies)
    pages.push({
      id: 'together',
      icon: UsersIcon,
      color: colors.info,
      title: i18n.t('scheduleIntro_together_title'),
      caption: i18n.t('scheduleIntro_together_caption'),
    })
  return pages
}

/**
 * How to get the most from Schedule, the first time it opens (and again from
 * Schedule's header): plan days, keep them to build a streak, what to do when
 * life happens, and planning with buddies. Paged like the update reveal's tour;
 * it ends on planning a day.
 */
export default function ScheduleIntroOverlay({
  source,
}: {
  source: ScheduleIntroSource
}) {
  const theme = useTheme()
  const palette = getWelcomePalette(theme)
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const reduceMotion = useReducedMotion()
  const { time } = useWelcomeMotion(!reduceMotion)
  const { streakKind } = usePublisher()
  const buddies = useBuddiesEnabled()
  const close = useScheduleIntro((state) => state.close)
  const set = usePreferences((state) => state.set)
  // Fixed as it opens: Buddies' flag loads over the network, and a page
  // appearing mid-tour would shift the ones being swiped.
  const [pages] = useState(() => introPages(theme.colors, streakKind, buddies))

  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [index, setIndex] = useState(0)
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollX = useSharedValue(0)
  const fade = useSharedValue(0)
  const viewed = useRef(new Set<string>())
  const closing = useRef(false)
  const last = index === pages.length - 1
  const pageId = pages[index]?.id

  useEffect(() => {
    fade.value = withTiming(1, { duration: 280 })
  }, [fade])

  useEffect(() => {
    if (pageId) viewed.current.add(pageId)
  }, [pageId])

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x
  })
  useAnimatedReaction(
    () => (width > 0 ? Math.round(scrollX.value / width) : 0),
    (now, before) => {
      if (now !== before) scheduleOnRN(setIndex, now)
    }
  )

  const leave = (method: CloseMethod) => {
    close()
    if (method === 'plan')
      navigation.navigate('PlanDay', { date: new Date().toISOString() })
  }

  const finish = (method: CloseMethod) => {
    if (closing.current) return
    closing.current = true
    analytics.capture('schedule_intro_closed', {
      source,
      method,
      pages_viewed: viewed.current.size,
      page_count: pages.length,
    })
    set({ scheduleIntroSeen: true })
    // Leaves even if the fade is cut short, so the intro can't get stuck.
    fade.value = withTiming(0, { duration: 220 }, () => {
      scheduleOnRN(leave, method)
    })
  }

  const next = () => {
    if (last) return finish('plan')
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true })
  }

  const rootStyle = useAnimatedStyle(() => ({ opacity: fade.value }))
  const linkStyle = useAnimatedStyle(() => ({
    opacity: withTiming(last ? 1 : 0, { duration: 250 }),
  }))

  return (
    <FullWindowOverlay open onClose={() => finish('back')}>
      <Animated.View
        accessibilityViewIsModal
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: palette.base },
          rootStyle,
        ]}
        onLayout={(e: LayoutChangeEvent) =>
          setWidth(e.nativeEvent.layout.width)
        }
      >
        <View
          style={{
            flex: 1,
            paddingTop: insets.top + 8,
            paddingBottom: Math.max(insets.bottom, 20),
          }}
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
              onPress={() => finish('close')}
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
                  <ScheduleIntroPage
                    key={page.id}
                    page={page}
                    index={i}
                    width={width}
                    height={height}
                    scrollX={scrollX}
                    active={i === index}
                    palette={palette}
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
              label={i18n.t(
                last ? 'scheduleIntro_planADay' : 'updateReveal_next'
              )}
              onPress={next}
              time={time}
              palette={palette}
              reduceMotion={reduceMotion}
            />
            <Animated.View
              style={[{ marginTop: 10, alignItems: 'center' }, linkStyle]}
              pointerEvents={last ? 'auto' : 'none'}
            >
              <Button
                onPress={() => finish('done')}
                accessibilityRole='button'
                accessibilityElementsHidden={!last}
                importantForAccessibility={
                  last ? 'auto' : 'no-hide-descendants'
                }
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
      </Animated.View>
    </FullWindowOverlay>
  )
}

/** One step of the intro's progress, filling as it's reached. */
function Segment({
  filled,
  palette,
  reduceMotion,
}: {
  filled: boolean
  palette: WelcomePalette
  reduceMotion: boolean
}) {
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
