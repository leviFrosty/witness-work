import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Platform,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import {
  ChevronBackwardIcon,
  ChevronForwardIcon,
} from '@/components/ui/DirectionalIcon'
import HorizontalDragScroll, {
  type HorizontalDragEnd,
} from '@/components/ui/HorizontalDragScroll'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import { webFocus, webFocusVisual } from '@/components/ui/webFocus'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import { analytics } from '@/lib/analytics'
import type { FollowUpCardItem } from '@/lib/conversations'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import type { Visit } from '@/types/visit'
import FollowUpCardCaughtUp from '@/features/visits/components/FollowUpCardCaughtUp'
import FollowUpCardEntry from '@/features/visits/components/FollowUpCardEntry'
import FollowUpCardProgress from '@/features/visits/components/FollowUpCardProgress'
import useFollowUpCardDismissal from '@/features/visits/hooks/useFollowUpCardDismissal'
import useFollowUpCardItems from '@/features/visits/hooks/useFollowUpCardItems'
import useHasFinePointer from '@/hooks/useHasFinePointer'
import useLogNotAtHome from '@/hooks/useLogNotAtHome'
import useNow from '@/hooks/useNow'
import { flowScrollX, isRtlLayout } from '@/lib/direction'

const PADDING = 16
const GAP = 10

const PEEK = 28

const ADVANCE_DELAY_MS = 700
const UNDO_TIMEOUT_MS = 6000
const PROGRAMMATIC_SCROLL_MS = 600
const NAV_BUTTON_SIZE = 32
const NAV_BUTTON_FRAME = [
  touchTargetFrame(NAV_BUTTON_SIZE, NAV_BUTTON_SIZE),
  { borderRadius: 999 },
]

const nextOpenIndex = (items: FollowUpCardItem[], from: number) => {
  const after = items.findIndex((item, i) => i > from && !item.answeredBy)
  return after >= 0 ? after : items.findIndex((item) => !item.answeredBy)
}

const ApproachingConversations = ({
  headerAction,
}: {
  headerAction?: ReactNode
}) => {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const hasFinePointer = useHasFinePointer()
  const items = useFollowUpCardItems()

  const { now: nowMs } = useNow()
  const { dismissed, dismiss } = useFollowUpCardDismissal(
    'approaching',
    items.map((item) => item.visit)
  )
  const notAtHome = useLogNotAtHome()
  const scrollRef = useRef<ScrollView>(null)
  const programmaticTargetRef = useRef<number | null>(null)
  const programmaticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const [width, setWidth] = useState(0)
  const [index, setIndex] = useState(0)
  const [lastNotAtHome, setLastNotAtHome] = useState<Visit>()

  const done = items.filter((item) => item.answeredBy).length
  const allDone = items.length > 0 && done === items.length
  const single = items.length === 1
  const currentIndex = Math.max(0, Math.min(index, items.length - 1))
  const entryWidth = Math.max(
    0,
    width - PADDING * 2 - (single ? 0 : PEEK + GAP)
  )
  const interval = entryWidth + GAP

  const rtl = isRtlLayout()
  const contentWidth =
    PADDING * 2 +
    items.length * entryWidth +
    Math.max(0, items.length - 1) * GAP
  const maxScroll = Math.max(0, contentWidth - width)

  const offsetFor = (target: number) => {
    const forward = Math.min(target * interval, maxScroll)
    if (Platform.OS === 'web') return rtl ? -forward : forward
    return flowScrollX(forward, contentWidth, width, rtl)
  }

  const indexForOffset = (
    x: number,
    measuredContentWidth: number,
    measuredViewportWidth: number
  ) => {
    if (interval <= 0 || items.length <= 1) return 0
    const measuredMax = Math.max(
      0,
      measuredContentWidth - measuredViewportWidth
    )
    const forward =
      Platform.OS === 'web'
        ? rtl
          ? -x
          : x
        : flowScrollX(x, measuredContentWidth, measuredViewportWidth, rtl)
    if (measuredMax > 0 && forward >= measuredMax - 2) return items.length - 1
    return Math.max(
      0,
      Math.min(items.length - 1, Math.round(forward / interval))
    )
  }

  const clearProgrammaticTarget = () => {
    programmaticTargetRef.current = null
    if (programmaticTimerRef.current !== null) {
      clearTimeout(programmaticTimerRef.current)
      programmaticTimerRef.current = null
    }
  }

  const scrollTo = (target: number, animated: boolean) => {
    const clamped = Math.max(0, Math.min(items.length - 1, target))
    const x = offsetFor(clamped)
    setAdvanceTo(undefined)
    clearProgrammaticTarget()
    if (animated) {
      programmaticTargetRef.current = x
      programmaticTimerRef.current = setTimeout(
        clearProgrammaticTarget,
        PROGRAMMATIC_SCROLL_MS
      )
    }
    scrollRef.current?.scrollTo({ x, animated })
    setIndex(clamped)
  }

  const answeredKey = items
    .filter((item) => item.answeredBy)
    .map((item) => item.visit.id)
    .join()
  const [prevAnsweredKey, setPrevAnsweredKey] = useState(answeredKey)
  const [advanceTo, setAdvanceTo] = useState<number>()

  const [completedCount, setCompletedCount] = useState<number>()
  if (answeredKey !== prevAnsweredKey) {
    setPrevAnsweredKey(answeredKey)
    const next = nextOpenIndex(items, currentIndex)
    if (items[currentIndex]?.answeredBy && next >= 0) setAdvanceTo(next)
    setCompletedCount(allDone ? items.length : undefined)
  }

  useEffect(() => clearProgrammaticTarget, [])

  useEffect(() => {
    if (advanceTo === undefined) return
    const timer = setTimeout(() => {
      const forward = Math.min(advanceTo * interval, maxScroll)
      const x =
        Platform.OS === 'web'
          ? rtl
            ? -forward
            : forward
          : flowScrollX(forward, contentWidth, width, rtl)
      const animated = !reduceMotion
      clearProgrammaticTarget()
      if (animated) {
        programmaticTargetRef.current = x
        programmaticTimerRef.current = setTimeout(
          clearProgrammaticTarget,
          PROGRAMMATIC_SCROLL_MS
        )
      }
      scrollRef.current?.scrollTo({ x, animated })
      setIndex(advanceTo)
      setAdvanceTo(undefined)
    }, ADVANCE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [advanceTo, interval, maxScroll, contentWidth, width, rtl, reduceMotion])

  useEffect(() => {
    if (completedCount === undefined) return
    Haptics.success()
    analytics.capture('follow_up_card_completed', { count: completedCount })
  }, [completedCount])

  useEffect(() => {
    if (!lastNotAtHome) return
    const timer = setTimeout(() => setLastNotAtHome(undefined), UNDO_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [lastNotAtHome])

  if (items.length === 0 || dismissed) return null

  const handleLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width
    if (next === width) return

    if (width === 0) setIndex(Math.max(0, nextOpenIndex(items, -1)))
    setWidth(next)
  }

  const handleScroll = ({
    nativeEvent,
  }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (single || interval <= 0) return
    const x = nativeEvent.contentOffset.x
    if (programmaticTargetRef.current !== null) {
      if (Math.abs(x - programmaticTargetRef.current) < 2) {
        clearProgrammaticTarget()
      }
      return
    }
    const next = indexForOffset(
      x,
      nativeEvent.contentSize.width,
      nativeEvent.layoutMeasurement.width
    )
    if (next !== currentIndex) setIndex(next)
  }

  const handleDragStart = () => {
    setAdvanceTo(undefined)
    clearProgrammaticTarget()
  }

  const handleDragEnd = ({ deltaX, scrollLeft }: HorizontalDragEnd) => {
    if (single || interval <= 0) return
    const nearest = indexForOffset(scrollLeft, contentWidth, width)
    const forwardDrag = rtl ? deltaX : -deltaX
    const stepThreshold = Math.min(48, interval * 0.15)
    let target = nearest
    if (nearest === currentIndex && Math.abs(forwardDrag) >= stepThreshold) {
      target = currentIndex + (forwardDrag > 0 ? 1 : -1)
    }
    scrollTo(target, !reduceMotion)
  }

  const logNotAtHome = (item: FollowUpCardItem) => {
    Haptics.light()
    setLastNotAtHome(notAtHome.log(item.visit.contact.id))
  }

  const undoNotAtHome = () => {
    if (!lastNotAtHome) return
    const target = items.findIndex(
      (item) => item.answeredBy?.id === lastNotAtHome.id
    )
    notAtHome.undo(lastNotAtHome)
    setLastNotAtHome(undefined)
    setAdvanceTo(undefined)

    if (target >= 0) scrollTo(target, !reduceMotion)
  }

  const now = moment(nowMs)
  const isMorning = now.isBefore(now.clone().endOf('day').hour(16))
  const title = i18n.t(
    isMorning ? 'todaysConversations' : 'upcomingConversations'
  )
  const showNavControls = hasFinePointer && !single && !allDone

  return (
    <Card style={{ paddingHorizontal: 0, paddingVertical: 16, gap: 14 }}>
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        {}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <HomeSectionMenu
            accessibilityLabel={title}
            style={{ flex: 1 }}
            actions={[
              [
                {
                  id: 'close_follow_up_card',
                  title: i18n.t('followUpCard_close'),
                  systemImage: 'checkmark.circle',
                  onPress: dismiss,
                },
              ],
            ]}
          >
            <View style={{ gap: 2 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('lg'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {title}
              </Text>
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('followUpCard_progress', {
                  done,
                  total: items.length,
                })}
              </Text>
            </View>
          </HomeSectionMenu>
          {headerAction}
          {showNavControls && (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <NavArrowButton
                direction='prev'
                disabled={currentIndex <= 0}
                onPress={() => scrollTo(currentIndex - 1, !reduceMotion)}
              />
              <NavArrowButton
                direction='next'
                disabled={currentIndex >= items.length - 1}
                onPress={() => scrollTo(currentIndex + 1, !reduceMotion)}
              />
            </View>
          )}
        </View>
        {!single && <FollowUpCardProgress done={done} total={items.length} />}
      </View>
      <View onLayout={handleLayout}>
        {allDone ? (
          <FollowUpCardCaughtUp
            items={items}
            celebrate={completedCount !== undefined}
            onDone={dismiss}
          />
        ) : (
          width > 0 && (
            <HorizontalDragScroll
              enabled={!single}
              snapPadding={PADDING}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onWheelScroll={handleDragStart}
            >
              <ScrollView
                ref={scrollRef}
                horizontal
                scrollEnabled={!single}
                showsHorizontalScrollIndicator={false}
                decelerationRate='fast'
                snapToInterval={interval}
                disableIntervalMomentum
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingHorizontal: PADDING, gap: GAP }}
                onLayout={() =>
                  scrollRef.current?.scrollTo({
                    x: offsetFor(currentIndex),
                    animated: false,
                  })
                }
                onScroll={handleScroll}
                onScrollBeginDrag={handleDragStart}
                onMomentumScrollEnd={({ nativeEvent }) => {
                  clearProgrammaticTarget()
                  setIndex(
                    indexForOffset(
                      nativeEvent.contentOffset.x,
                      nativeEvent.contentSize.width,
                      nativeEvent.layoutMeasurement.width
                    )
                  )
                }}
              >
                {items.map((item) => (
                  <FollowUpCardEntry
                    key={item.visit.id}
                    item={item}
                    width={entryWidth}
                    onNotAtHome={logNotAtHome}
                  />
                ))}
              </ScrollView>
            </HorizontalDragScroll>
          )
        )}
      </View>
      {lastNotAtHome && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 20,
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('followUpCard_notAtHomeLogged')}
          </Text>
          <Button onPress={undoNotAtHome} hitSlop={8}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
                color: theme.colors.accent,
              }}
            >
              {i18n.t('undo')}
            </Text>
          </Button>
        </View>
      )}
    </Card>
  )
}

function NavArrowButton({
  direction,
  disabled,
  onPress,
}: {
  direction: 'prev' | 'next'
  disabled: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const isNext = direction === 'next'

  return (
    <Button
      {...webFocus('proxy')}
      onPress={onPress}
      disabled={disabled}
      pointerEffect={disabled ? 'none' : 'highlight'}
      accessibilityRole='button'
      accessibilityLabel={i18n.t(
        isNext ? 'pagination.next' : 'pagination.previous'
      )}
      accessibilityState={{ disabled }}
      style={NAV_BUTTON_FRAME}
    >
      <View
        {...webFocusVisual}
        style={{
          width: NAV_BUTTON_SIZE,
          height: NAV_BUTTON_SIZE,
          borderRadius: NAV_BUTTON_SIZE / 2,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.backgroundLighter,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.35 : 1,
        }}
      >
        <LucideIcon
          icon={isNext ? ChevronForwardIcon : ChevronBackwardIcon}
          size={16}
          color={theme.colors.text}
        />
      </View>
    </Button>
  )
}

export default ApproachingConversations
