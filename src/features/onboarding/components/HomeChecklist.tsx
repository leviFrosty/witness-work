import { analytics } from '@/lib/analytics'
import { noteUserAction } from '@/lib/userAction'
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
import { getMonthsReports, isCountableEntry } from '@/lib/serviceReport'
import { TimeEntry } from '@/types/timeEntry'
import { useShallow } from 'zustand/react/shallow'
import {
  countLoggedDays,
  daysSinceInstallBucket,
  HomeChecklistItemId,
  LOGGED_DAYS_GOAL,
  manualCompletionIdsFor,
  resolveManualCompletions,
} from '@/features/onboarding/lib/homeChecklist'

/**
 * The first week with WitnessWork, in the order it happens. Every step can be
 * done in the first few days; none waits for the month to end.
 */
const ITEM_IDS: HomeChecklistItemId[] = [
  'setMonthlyGoal',
  'logFirstMinute',
  'addFirstContact',
  'logThreeDays',
]

const LABEL_I18N_KEY: Record<HomeChecklistItemId, TranslationKey> = {
  setMonthlyGoal: 'homeChecklistPlanADay',
  logFirstMinute: 'homeChecklistLogFirstMinute',
  addFirstContact: 'homeChecklistAddFirstContact',
  logThreeDays: 'homeChecklistLogThreeDays',
}

type ChecklistItem = {
  id: HomeChecklistItemId
  label: string
  /** "1/3" while a counted step is partway done. */
  progress?: string
  /** Spoken in place of `progress`. */
  progressA11y?: string
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
    installedOn,
    set: setPref,
  } = usePreferences(
    useShallow((s) => ({
      homeChecklistDismissed: s.homeChecklistDismissed,
      homeChecklistManualCompletions: s.homeChecklistManualCompletions,
      homeChecklistAllDoneCelebrated: s.homeChecklistAllDoneCelebrated,
      installedOn: s.installedOn,
      set: s.set,
    }))
  )
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

  // Days with a logged TimeEntry (dayPlans/recurringPlans intentionally
  // excluded — the aha moment is a _logged_ minute, not a planned or
  // rolled-over one). Coming back on 3 different days in the first week is
  // what keeps people using the app.
  const loggedDays = useMemo(
    () => countLoggedDays(serviceReports),
    [serviceReports]
  )

  const hasAnyContact = contacts.length > 0
  const hasAnyPlan = dayPlans.length > 0 || recurringPlans.length > 0

  const hasReportThisMonth = useMemo(
    () =>
      getMonthsReports(serviceReports, moment().month(), moment().year()).some(
        isCountableEntry
      ),
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
    noteUserAction('checkbox')
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
    if (loggedDays > 0) set.add('logFirstMinute')
    if (hasAnyContact) set.add('addFirstContact')
    if (loggedDays >= LOGGED_DAYS_GOAL) set.add('logThreeDays')
    return set
  }, [hasAnyPlan, loggedDays, hasAnyContact])

  const manualCompletions = resolveManualCompletions(
    homeChecklistManualCompletions
  )

  // Checkbox publishers share once a month, so logging on separate days
  // doesn't apply; checking off the month is their step.
  const itemIds = ITEM_IDS.filter(
    (id) => id !== 'logThreeDays' || showsTimeEntry
  )

  const items: ChecklistItem[] = itemIds.map((id) => {
    const checksOffMonth = id === 'logFirstMinute' && !showsTimeEntry
    const counted = id === 'logThreeDays' && loggedDays > 0
    const progressParams = { count: loggedDays, total: LOGGED_DAYS_GOAL }
    return {
      id,
      checksOffMonth,
      label: i18n.t(
        checksOffMonth ? 'homeChecklistCheckOffFirstMonth' : LABEL_I18N_KEY[id]
      ),
      progress: counted
        ? i18n.t('homeChecklistDaysProgress', progressParams)
        : undefined,
      progressA11y: counted
        ? i18n.t('homeChecklistDaysProgressA11y', progressParams)
        : undefined,
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
          case 'logThreeDays':
            rootNavigation.navigate('Add Time')
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
    manualCompletions.has(id)

  // Items the app can't detect (or the user did another way) can be checked
  // off by hand from the step marker or the item's long-press menu.
  // Auto-completed items stay done.
  const setManuallyDone = (id: HomeChecklistItemId, done: boolean) => {
    const stored = manualCompletionIdsFor(id)
    const others = homeChecklistManualCompletions.filter(
      (it) => !stored.includes(it)
    )
    setPref({ homeChecklistManualCompletions: done ? [...others, id] : others })
  }

  const allDone = items.every((it) => isComplete(it.id))
  const nextId = items.find((it) => !isComplete(it.id))?.id
  const doneKey = items
    .filter((it) => isComplete(it.id))
    .map((it) => it.id)
    .join(',')

  const handleDismiss = () => {
    analytics.capture('onboarding_checklist_dismissed', { all_done: allDone })
    setPref({ homeChecklistDismissed: true })
  }

  const viewed = useRef(false)
  useEffect(() => {
    if (!isFocused || homeChecklistDismissed || viewed.current) return
    viewed.current = true
    analytics.capture('onboarding_checklist_viewed', {
      item_count: items.length,
      all_done: allDone,
    })
  }, [isFocused, homeChecklistDismissed, allDone, items.length])

  // One event per step as it gets done while the checklist is up. Steps that
  // were already done when it mounted aren't sent again.
  const reportedDoneKey = useRef<string | null>(null)
  useEffect(() => {
    if (homeChecklistDismissed || homeChecklistAllDoneCelebrated) return
    const before = reportedDoneKey.current
    reportedDoneKey.current = doneKey
    if (before === null) return
    const wasDone = new Set(before.split(','))
    for (const id of doneKey.split(',') as HomeChecklistItemId[]) {
      if (!id || wasDone.has(id)) continue
      analytics.capture('onboarding_checklist_item_completed', {
        item: id,
        method: autoCompletedIds.has(id) ? 'auto' : 'manual',
        days_since_install: daysSinceInstallBucket(installedOn),
      })
    }
  }, [
    doneKey,
    homeChecklistDismissed,
    homeChecklistAllDoneCelebrated,
    autoCompletedIds,
    installedOn,
  ])

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
    setPref({
      homeChecklistAllDoneCelebrated: true,
      homeChecklistCompletedAt: Date.now(),
    })
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
          accessibilityRole='header'
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
                {/* Screen readers get one element per step: the row beside
                it, which reads the done state and offers Mark as Done / Not
                Done as actions. Otherwise each step is read twice. */}
                <Pressable
                  onPress={() => setManuallyDone(item.id, !done)}
                  disabled={autoDone}
                  hitSlop={8}
                  accessibilityElementsHidden
                  importantForAccessibility='no-hide-descendants'
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
                accessibilityLabel={[
                  item.label,
                  done ? i18n.t('completed') : item.progressA11y,
                ]
                  .filter(Boolean)
                  .join(', ')}
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
                <XView style={{ gap: 8, alignItems: 'flex-start' }}>
                  <Text
                    style={{
                      flex: 1,
                      minHeight: NODE_SIZE,
                      paddingTop: 2,
                      fontSize: theme.fontSize('md'),
                      fontFamily: isNext ? theme.fonts.semiBold : undefined,
                      color: done ? theme.colors.textAlt : theme.colors.text,
                    }}
                  >
                    {item.label}
                  </Text>
                  {!done && item.progress && (
                    <Text
                      style={{
                        paddingTop: 2,
                        fontSize: theme.fontSize('sm'),
                        fontFamily: theme.fonts.semiBold,
                        color: theme.colors.textAlt,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {item.progress}
                    </Text>
                  )}
                </XView>
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
