import { useEffect, useRef, useState } from 'react'
import { ScrollView, View, type LayoutChangeEvent } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
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
import useLogNotAtHome from '@/features/visits/hooks/useLogNotAtHome'

const PADDING = 16
const GAP = 10
/** How much of the next Follow-up shows, hinting there's more to swipe to. */
const PEEK = 28
/** Long enough to see a Follow-up marked done before moving on. */
const ADVANCE_DELAY_MS = 700
const UNDO_TIMEOUT_MS = 6000

/** The nearest open Follow-up after `from`, else the first open one. */
const nextOpenIndex = (items: FollowUpCardItem[], from: number) => {
  const after = items.findIndex((item, i) => i > from && !item.answeredBy)
  return after >= 0 ? after : items.findIndex((item) => !item.answeredBy)
}

/**
 * Home's Follow-up card: today's Follow-ups one at a time, each answered with a
 * tap, with progress toward all caught up.
 */
const ApproachingConversations = () => {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const items = useFollowUpCardItems()
  const { dismissed, dismiss } = useFollowUpCardDismissal(
    'approaching',
    items.map((item) => item.visit)
  )
  const notAtHome = useLogNotAtHome()
  const scrollRef = useRef<ScrollView>(null)
  const [width, setWidth] = useState(0)
  const [index, setIndex] = useState(0)
  const [lastNotAtHome, setLastNotAtHome] = useState<Visit>()

  const done = items.filter((item) => item.answeredBy).length
  const allDone = items.length > 0 && done === items.length
  const single = items.length === 1
  const entryWidth = Math.max(
    0,
    width - PADDING * 2 - (single ? 0 : PEEK + GAP)
  )
  const interval = entryWidth + GAP

  const scrollTo = (target: number, animated: boolean) => {
    scrollRef.current?.scrollTo({ x: target * interval, animated })
    setIndex(target)
  }

  // When the Follow-up in view gets answered, move on to the next open one.
  // Tracked as "previous answers" state so swiping back to a done one doesn't
  // bounce away again.
  const answeredKey = items
    .filter((item) => item.answeredBy)
    .map((item) => item.visit.id)
    .join()
  const [prevAnsweredKey, setPrevAnsweredKey] = useState(answeredKey)
  const [advanceTo, setAdvanceTo] = useState<number>()
  /** How many were on the card when the last one was answered here. */
  const [completedCount, setCompletedCount] = useState<number>()
  if (answeredKey !== prevAnsweredKey) {
    setPrevAnsweredKey(answeredKey)
    const next = nextOpenIndex(items, index)
    if (items[index]?.answeredBy && next >= 0) setAdvanceTo(next)
    setCompletedCount(allDone ? items.length : undefined)
  }

  useEffect(() => {
    if (advanceTo === undefined) return
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: advanceTo * interval,
        animated: !reduceMotion,
      })
      setIndex(advanceTo)
      setAdvanceTo(undefined)
    }, ADVANCE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [advanceTo, interval, reduceMotion])

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
    // Open on the first Follow-up still to do.
    if (width === 0) setIndex(Math.max(0, nextOpenIndex(items, -1)))
    setWidth(next)
  }

  const logNotAtHome = (item: FollowUpCardItem) => {
    Haptics.light()
    setLastNotAtHome(notAtHome.log(item.visit.contact.id))
    analytics.capture('follow_up_card_action', { action: 'not_at_home' })
  }

  const undoNotAtHome = () => {
    if (!lastNotAtHome) return
    const target = items.findIndex(
      (item) => item.answeredBy?.id === lastNotAtHome.id
    )
    notAtHome.undo(lastNotAtHome)
    setLastNotAtHome(undefined)
    setAdvanceTo(undefined)
    // Bring the reopened Follow-up back into view.
    if (target >= 0) scrollTo(target, !reduceMotion)
    analytics.capture('follow_up_card_action', { action: 'undo' })
  }

  const isMorning = moment().isBefore(moment().endOf('day').hour(16)) // 4:59:59 PM
  const title = i18n.t(
    isMorning ? 'todaysConversations' : 'upcomingConversations'
  )

  return (
    <Card style={{ paddingHorizontal: 0, paddingVertical: 16, gap: 14 }}>
      <HomeSectionMenu
        section='approachingConversations'
        accessibilityLabel={title}
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
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
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
              {i18n.t('followUpCard_progress', { done, total: items.length })}
            </Text>
          </View>
          {!single && <FollowUpCardProgress done={done} total={items.length} />}
        </View>
      </HomeSectionMenu>
      <View onLayout={handleLayout}>
        {allDone ? (
          <FollowUpCardCaughtUp
            items={items}
            celebrate={completedCount !== undefined}
            onDone={dismiss}
          />
        ) : (
          width > 0 && (
            <ScrollView
              ref={scrollRef}
              horizontal
              scrollEnabled={!single}
              showsHorizontalScrollIndicator={false}
              decelerationRate='fast'
              snapToInterval={interval}
              disableIntervalMomentum
              contentContainerStyle={{ paddingHorizontal: PADDING, gap: GAP }}
              // Mounts at the start; jump to the Follow-up in focus (also
              // after Undo brings the list back from all caught up).
              onLayout={() =>
                scrollRef.current?.scrollTo({
                  x: index * interval,
                  animated: false,
                })
              }
              // A swipe overrides a pending move to the next Follow-up.
              onScrollBeginDrag={() => setAdvanceTo(undefined)}
              onMomentumScrollEnd={(e) =>
                setIndex(Math.round(e.nativeEvent.contentOffset.x / interval))
              }
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

export default ApproachingConversations
