import { analytics } from '@/lib/analytics'
import {
  Check as CheckIcon,
  CircleCheck as CircleCheckIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Pressable, View } from 'react-native'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import i18n, { TranslationKey } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import useContacts from '@/stores/contactsStore'
import usePublisher from '@/hooks/usePublisher'
import useFireworks from '@/hooks/useFireworks'
import useAnimation from '@/hooks/useAnimation'
import { CONFETTI_DELAY_MS } from '@/providers/AnimationViewProvider'
import Haptics from '@/lib/haptics'
import Button from '@/components/ui/Button'
import { HomeTabStackNavigation } from '@/types/homeStack'
import { RootStackNavigation } from '@/types/rootStack'
import DismissableCard from '@/components/DismissableCard'
import ContextMenu from '@/components/ui/ContextMenu'
import PointerHover from '@/components/ui/PointerHover'
import SupporterNote from '@/features/supporter/components/SupporterNote'
import { getMonthsReports } from '@/lib/serviceReport'
import { TimeEntry } from '@/types/timeEntry'

/**
 * Checklist item ids. Stable because manual completions are persisted (and
 * synced) by id.
 */
export type HomeChecklistItemId =
  | 'setMonthlyGoal'
  | 'logFirstMinute'
  | 'addFirstContact'
  | 'sendFirstReport'

/** The first month with WitnessWork, in the order it happens. */
const ITEM_IDS: HomeChecklistItemId[] = [
  'setMonthlyGoal',
  'logFirstMinute',
  'addFirstContact',
  'sendFirstReport',
]

const LABEL_I18N_KEY: Record<HomeChecklistItemId, TranslationKey> = {
  setMonthlyGoal: 'homeChecklistSetMonthlyGoal',
  logFirstMinute: 'homeChecklistLogFirstMinute',
  addFirstContact: 'homeChecklistAddFirstContact',
  sendFirstReport: 'homeChecklistSendFirstReport',
}

type ChecklistItem = {
  id: HomeChecklistItemId
  label: string
  onPress: () => void
  /** Tapping checks off this month instead of opening a screen. */
  checksOffMonth: boolean
}

const NODE_SIZE = 26
const CONNECTOR_WIDTH = 2
const STEP_GAP = 14

const HomeChecklist = () => {
  const theme = useTheme()
  const {
    homeChecklistDismissed,
    homeChecklistManualCompletions,
    homeChecklistAllDoneCelebrated,
    submittedReportMonths,
    set: setPref,
  } = usePreferences()
  const fireworks = useFireworks()
  const sealScale = useSharedValue(1)
  const sealAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sealScale.value }],
  }))
  const { serviceReports, dayPlans, recurringPlans, addServiceReport } =
    useServiceReport()
  const { contacts } = useContacts()
  const { showsTimeEntry } = usePublisher()
  const { playConfetti } = useAnimation()
  const homeNavigation = useNavigation<HomeTabStackNavigation>()
  const rootNavigation = useNavigation<RootStackNavigation>()
  // Tab preloading mounts HomeScreen before the user navigates to it, and a
  // checklist item can auto-complete from another screen (e.g. logging time).
  // Gate the celebration on actual Home focus so the burst is queued — backed
  // by the persisted `homeChecklistAllDoneCelebrated` flag — until the user
  // is actually looking at the Home tab.
  const isFocused = useIsFocused()

  // Any TimeEntry row (dayPlans/recurringPlans intentionally excluded —
  // the aha moment is a _logged_ minute, not a planned one).
  const hasAnyServiceReport = useMemo(() => {
    for (const year of Object.keys(serviceReports)) {
      const months = serviceReports[year]
      for (const month of Object.keys(months)) {
        if ((months[month]?.length ?? 0) > 0) return true
      }
    }
    return false
  }, [serviceReports])

  const hasAnyContact = contacts.length > 0
  const hasAnyPlan = dayPlans.length > 0 || recurringPlans.length > 0
  const hasSentReport = submittedReportMonths.length > 0

  const hasReportThisMonth = useMemo(
    () =>
      getMonthsReports(serviceReports, moment().month(), moment().year())
        .length > 0,
    [serviceReports]
  )

  const handleCheckOffMonth = useCallback(() => {
    if (hasReportThisMonth) return
    const report: TimeEntry = {
      date: new Date(),
      hours: 0,
      minutes: 0,
      id: Crypto.randomUUID(),
    }
    addServiceReport(report)
    analytics.capture('time_entry_created', {
      source: 'onboarding_checklist',
      entry_mode: 'checkbox',
    })
    Haptics.heavy()
    setTimeout(() => Haptics.success(), CONFETTI_DELAY_MS + 100)
    playConfetti()
  }, [hasReportThisMonth, addServiceReport, playConfetti])

  const autoCompletedIds = useMemo(() => {
    const set = new Set<HomeChecklistItemId>()
    if (hasAnyPlan) set.add('setMonthlyGoal')
    if (hasAnyServiceReport) set.add('logFirstMinute')
    if (hasAnyContact) set.add('addFirstContact')
    if (hasSentReport) set.add('sendFirstReport')
    return set
  }, [hasAnyPlan, hasAnyServiceReport, hasAnyContact, hasSentReport])

  const items: ChecklistItem[] = ITEM_IDS.map((id) => {
    const checksOffMonth = id === 'logFirstMinute' && !showsTimeEntry
    return {
      id,
      checksOffMonth,
      label: i18n.t(
        checksOffMonth ? 'homeChecklistCheckOffFirstMonth' : LABEL_I18N_KEY[id]
      ),
      onPress: () => {
        switch (id) {
          case 'setMonthlyGoal':
            homeNavigation.navigate('Schedule')
            break
          case 'logFirstMinute':
            if (checksOffMonth) handleCheckOffMonth()
            else rootNavigation.navigate('Add Time')
            break
          case 'addFirstContact':
            rootNavigation.navigate('Contact Form', { id: '' })
            break
          case 'sendFirstReport':
            rootNavigation.navigate('ServiceReportView', {
              month: moment().month(),
              year: moment().year(),
            })
            break
        }
      },
    }
  })

  // Once celebrated, the checklist stays finished even if its steps change in
  // a later version.
  const isComplete = (id: HomeChecklistItemId) =>
    homeChecklistAllDoneCelebrated ||
    autoCompletedIds.has(id) ||
    homeChecklistManualCompletions.includes(id)

  // Items the app can't detect (or the user did another way) can be checked
  // off by hand from the step marker or the item's long-press menu.
  // Auto-completed items stay done.
  const setManuallyDone = (id: HomeChecklistItemId, done: boolean) => {
    const others = homeChecklistManualCompletions.filter((it) => it !== id)
    setPref({ homeChecklistManualCompletions: done ? [...others, id] : others })
  }

  const allDone = items.every((it) => isComplete(it.id))
  const nextId = items.find((it) => !isComplete(it.id))?.id

  const handleDismiss = () => {
    analytics.capture('onboarding_checklist_dismissed', { all_done: allDone })
    setPref({ homeChecklistDismissed: true })
  }

  const viewed = useRef(false)
  useEffect(() => {
    if (!isFocused || homeChecklistDismissed || viewed.current) return
    viewed.current = true
    analytics.capture('onboarding_checklist_viewed', {
      item_count: ITEM_IDS.length,
      all_done: allDone,
    })
  }, [isFocused, homeChecklistDismissed, allDone])

  // One-shot celebration. Only fires when the user is actually focused on the
  // Home tab — if `allDone` flips while they're elsewhere (or the app is
  // closed), the burst stays queued via the persisted `celebrated` flag and
  // plays the next time they land on Home.
  useEffect(() => {
    if (!isFocused || !allDone || homeChecklistAllDoneCelebrated) return
    analytics.capture('onboarding_checklist_completed')
    Haptics.success()
    sealScale.value = withSequence(
      withTiming(1.25, { duration: 180 }),
      withTiming(1, { duration: 220 })
    )
    fireworks.fire({ count: 22, velocity: 220 })
    setPref({ homeChecklistAllDoneCelebrated: true })
  }, [
    isFocused,
    allDone,
    homeChecklistAllDoneCelebrated,
    fireworks,
    sealScale,
    setPref,
  ])

  if (homeChecklistDismissed) return null

  return (
    <DismissableCard
      onDismiss={handleDismiss}
      title={
        // Only the header is long-pressable: the items have their own menus.
        <ContextMenu
          actions={[
            {
              id: 'hide_checklist',
              title: i18n.t('hideChecklist'),
              systemImage: 'eye.slash',
              onPress: handleDismiss,
            },
          ]}
        >
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('homeChecklistHeader')}
          </Text>
        </ContextMenu>
      }
    >
      <View>
        {items.map((item, index) => {
          const done = isComplete(item.id)
          const autoDone = autoCompletedIds.has(item.id)
          const isNext = item.id === nextId
          const isLast = index === items.length - 1
          return (
            <XView
              key={item.id}
              style={{
                gap: 12,
                alignItems: 'flex-start',
                paddingBottom: isLast ? 0 : STEP_GAP,
              }}
            >
              {!isLast && (
                // The trail to the next step, filled once this one is done.
                <View
                  style={{
                    position: 'absolute',
                    top: NODE_SIZE,
                    bottom: 0,
                    left: (NODE_SIZE - CONNECTOR_WIDTH) / 2,
                    width: CONNECTOR_WIDTH,
                    backgroundColor: done
                      ? theme.colors.accent
                      : theme.colors.border,
                  }}
                />
              )}
              <PointerHover effect='highlight' enabled={!autoDone}>
                <Pressable
                  onPress={() => setManuallyDone(item.id, !done)}
                  disabled={autoDone}
                  hitSlop={8}
                  accessibilityRole='checkbox'
                  accessibilityState={{ checked: done, disabled: autoDone }}
                  accessibilityLabel={item.label}
                  style={{
                    width: NODE_SIZE,
                    height: NODE_SIZE,
                    borderRadius: NODE_SIZE / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: done ? 0 : 2,
                    borderColor: isNext
                      ? theme.colors.accent
                      : theme.colors.border,
                    backgroundColor: done
                      ? theme.colors.accent
                      : theme.colors.card,
                  }}
                >
                  {done ? (
                    <LucideIcon
                      icon={CheckIcon}
                      size={14}
                      color={theme.colors.textInverse}
                    />
                  ) : (
                    <Text
                      style={{
                        fontSize: theme.fontSize('xs'),
                        fontFamily: theme.fonts.bold,
                        color: isNext
                          ? theme.colors.accent
                          : theme.colors.textAlt,
                      }}
                    >
                      {index + 1}
                    </Text>
                  )}
                </Pressable>
              </PointerHover>
              <ContextMenu
                style={{ flex: 1 }}
                onPress={item.onPress}
                accessibilityLabel={item.label}
                hoverRadius={theme.numbers.borderRadiusSm}
                actions={[
                  !item.checksOffMonth && {
                    id: 'open',
                    title: i18n.t('open'),
                    systemImage: 'arrow.up.forward.app',
                    onPress: item.onPress,
                  },
                  !done && {
                    id: 'mark_done',
                    title: i18n.t('markAsDone'),
                    systemImage: 'checkmark.circle',
                    onPress: () => setManuallyDone(item.id, true),
                  },
                  done &&
                    !autoDone && {
                      id: 'mark_not_done',
                      title: i18n.t('markAsNotDone'),
                      systemImage: 'circle',
                      onPress: () => setManuallyDone(item.id, false),
                    },
                ]}
              >
                <Text
                  style={{
                    minHeight: NODE_SIZE,
                    paddingTop: 2,
                    fontSize: theme.fontSize('md'),
                    fontFamily: isNext ? theme.fonts.semiBold : undefined,
                    color: done ? theme.colors.textAlt : theme.colors.text,
                  }}
                >
                  {item.label}
                </Text>
              </ContextMenu>
            </XView>
          )
        })}
      </View>
      {allDone && (
        <View style={{ alignItems: 'center', gap: 10, marginTop: 8 }}>
          <Animated.View
            style={[
              {
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accentTranslucent,
              },
              sealAnimatedStyle,
            ]}
          >
            <LucideIcon
              icon={CircleCheckIcon}
              size={theme.fontSize('3xl')}
              style={{ color: theme.colors.accent }}
            />
          </Animated.View>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              color: theme.colors.text,
              fontFamily: theme.fonts.semiBold,
              textAlign: 'center',
            }}
          >
            {i18n.t('homeChecklistFooter')}
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <SupporterNote source='onboarding_checklist' />
          </View>
          <Button
            onPress={handleDismiss}
            style={{
              marginTop: 4,
              paddingVertical: 10,
              paddingHorizontal: 18,
              borderRadius: theme.numbers.borderRadiusSm,
              backgroundColor: theme.colors.accent,
            }}
          >
            <Text
              style={{
                color: theme.colors.textInverse,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('homeChecklistDismissCta')}
            </Text>
          </Button>
        </View>
      )}
    </DismissableCard>
  )
}

export default HomeChecklist
