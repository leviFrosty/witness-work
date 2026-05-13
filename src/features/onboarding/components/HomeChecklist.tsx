import { useCallback, useEffect, useMemo } from 'react'
import { Pressable, View } from 'react-native'
import {
  faCheck,
  faCircle,
  faCircleCheck,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
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
import i18n from '@/lib/locales'
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
import { getMonthsReports } from '@/lib/serviceReport'
import { ServiceReport as ServiceReportType } from '@/types/serviceReport'

/**
 * Canonical checklist item ids. These strings are intentionally stable so Phase
 * 6 (integrator) can coordinate auto-completion signals from other parts of the
 * app.
 */
export type HomeChecklistItemId =
  | 'logFirstMinute'
  | 'addFirstContact'
  | 'setMonthlyGoal'
  | 'tryTheMap'
  | 'trackTime'
  | 'returnVisits'
  | 'planWeek'
  | 'monthlyGoal'
  | 'mapContacts'

type ChecklistItem = {
  id: HomeChecklistItemId
  label: string
  onPress: () => void
}

/**
 * Map of intent-picker values (owned by Phase 2a) onto the default checklist
 * item ids. Intents live in the preferences store under `onboardingIntents` and
 * are read defensively — Phase 3 does not declare the field.
 */
const INTENT_TO_ITEM_ID: Record<string, HomeChecklistItemId> = {
  trackTime: 'logFirstMinute',
  returnVisits: 'addFirstContact',
  planWeek: 'planWeek',
  monthlyGoal: 'setMonthlyGoal',
  mapContacts: 'tryTheMap',
}

const DEFAULT_ITEM_IDS: HomeChecklistItemId[] = [
  'logFirstMinute',
  'addFirstContact',
  'setMonthlyGoal',
  'tryTheMap',
]

const LABEL_I18N_KEY: Record<HomeChecklistItemId, string> = {
  logFirstMinute: 'homeChecklistLogFirstMinute',
  addFirstContact: 'homeChecklistAddFirstContact',
  setMonthlyGoal: 'homeChecklistSetMonthlyGoal',
  tryTheMap: 'homeChecklistTryTheMap',
  trackTime: 'homeChecklistTrackTime',
  returnVisits: 'homeChecklistReturnVisits',
  planWeek: 'homeChecklistPlanWeek',
  monthlyGoal: 'homeChecklistSetMonthlyGoal',
  mapContacts: 'homeChecklistMapContacts',
}

const HomeChecklist = () => {
  const theme = useTheme()
  const prefs = usePreferences()
  const {
    homeChecklistDismissed,
    homeChecklistManualCompletions,
    homeChecklistAllDoneCelebrated,
    hasCompletedMapOnboarding,
    set: setPref,
  } = prefs
  const fireworks = useFireworks()
  const sealScale = useSharedValue(1)
  const sealAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sealScale.value }],
  }))
  const { serviceReports, dayPlans, recurringPlans, addServiceReport } =
    useServiceReport()
  const { contacts } = useContacts()
  const { entryMode } = usePublisher()
  const isCheckboxMode = entryMode === 'checkbox'
  const { playConfetti } = useAnimation()
  const homeNavigation = useNavigation<HomeTabStackNavigation>()
  const rootNavigation = useNavigation<RootStackNavigation>()
  // Tab preloading mounts HomeScreen before the user navigates to it, and a
  // checklist item can auto-complete from another screen (e.g. logging time).
  // Gate the celebration on actual Home focus so the burst is queued — backed
  // by the persisted `homeChecklistAllDoneCelebrated` flag — until the user
  // is actually looking at the Home tab.
  const isFocused = useIsFocused()

  // Phase 2a owns the `onboardingIntents` field — read defensively so this
  // component compiles before Phase 2a lands. See docs/onboarding-overhaul-plan.md.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onboardingIntentsRaw = (prefs as any).onboardingIntents

  // Any ServiceReport row (dayPlans/recurringPlans intentionally excluded —
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

  const hasReportThisMonth = useMemo(
    () =>
      getMonthsReports(serviceReports, moment().month(), moment().year())
        .length > 0,
    [serviceReports]
  )

  const handleCheckOffMonth = useCallback(() => {
    if (hasReportThisMonth) return
    const report: ServiceReportType = {
      date: new Date(),
      hours: 0,
      minutes: 0,
      id: Crypto.randomUUID(),
    }
    addServiceReport(report)
    Haptics.heavy()
    setTimeout(() => Haptics.success(), CONFETTI_DELAY_MS + 100)
    playConfetti()
  }, [hasReportThisMonth, addServiceReport, playConfetti])

  const autoCompletedIds = useMemo(() => {
    const set = new Set<HomeChecklistItemId>()
    if (hasAnyServiceReport) set.add('logFirstMinute')
    if (hasAnyContact) set.add('addFirstContact')
    if (hasCompletedMapOnboarding) {
      set.add('tryTheMap')
      set.add('mapContacts')
    }
    if (hasAnyPlan) {
      set.add('setMonthlyGoal')
      set.add('monthlyGoal')
      set.add('planWeek')
    }
    return set
  }, [
    hasAnyServiceReport,
    hasAnyContact,
    hasCompletedMapOnboarding,
    hasAnyPlan,
  ])

  const selectedItemIds = useMemo<HomeChecklistItemId[]>(() => {
    const intents: string[] = Array.isArray(onboardingIntentsRaw)
      ? onboardingIntentsRaw
      : []
    const base =
      intents.length === 0
        ? DEFAULT_ITEM_IDS
        : (() => {
            const mapped = intents
              .map((intent) => INTENT_TO_ITEM_ID[intent])
              .filter((id): id is HomeChecklistItemId => Boolean(id))
            // Fall back to defaults if every intent is unrecognised (e.g. a
            // future intent value added upstream) so the user still sees
            // something useful.
            return mapped.length > 0 ? mapped : DEFAULT_ITEM_IDS
          })()

    return base
  }, [onboardingIntentsRaw])

  const items = useMemo<ChecklistItem[]>(
    () =>
      selectedItemIds.map((id) => {
        const isTrackTime = id === 'logFirstMinute' || id === 'trackTime'
        const labelKey =
          isTrackTime && isCheckboxMode
            ? 'homeChecklistCheckOffFirstMonth'
            : LABEL_I18N_KEY[id]
        return {
          id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: i18n.t(labelKey as any),
          onPress: () => {
            switch (id) {
              case 'logFirstMinute':
              case 'trackTime':
                if (isCheckboxMode) {
                  handleCheckOffMonth()
                } else {
                  rootNavigation.navigate('Add Time')
                }
                break
              case 'addFirstContact':
              case 'returnVisits':
                rootNavigation.navigate('Contact Form', {
                  id: '',
                })
                break
              case 'setMonthlyGoal':
              case 'monthlyGoal':
                homeNavigation.navigate('Schedule')
                break
              case 'tryTheMap':
              case 'mapContacts':
                homeNavigation.navigate('Map')
                break
              case 'planWeek':
                homeNavigation.navigate('Schedule')
                break
            }
          },
        }
      }),
    [
      selectedItemIds,
      homeNavigation,
      rootNavigation,
      isCheckboxMode,
      handleCheckOffMonth,
    ]
  )

  const isComplete = (id: HomeChecklistItemId) =>
    autoCompletedIds.has(id) || homeChecklistManualCompletions.includes(id)

  const handleDismiss = () => setPref({ homeChecklistDismissed: true })

  const allDone = items.length > 0 && items.every((it) => isComplete(it.id))

  // One-shot celebration. Only fires when the user is actually focused on the
  // Home tab — if `allDone` flips while they're elsewhere (or the app is
  // closed), the burst stays queued via the persisted `celebrated` flag and
  // plays the next time they land on Home.
  useEffect(() => {
    if (!isFocused || !allDone || homeChecklistAllDoneCelebrated) return
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
  if (items.length === 0) return null

  return (
    <DismissableCard
      onDismiss={handleDismiss}
      title={
        <Text
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('homeChecklistHeader')}
        </Text>
      }
    >
      <View style={{ gap: 10 }}>
        {items.map((item) => {
          const done = isComplete(item.id)
          return (
            <Pressable
              key={item.id}
              onPress={item.onPress}
              hitSlop={4}
              accessibilityRole='button'
              accessibilityState={{ checked: done }}
              accessibilityLabel={item.label}
            >
              <XView style={{ gap: 12 }}>
                <FontAwesomeIcon
                  icon={done ? faCircleCheck : faCircle}
                  size={theme.fontSize('xl')}
                  style={{
                    color: done ? theme.colors.accent : theme.colors.border,
                  }}
                />
                <Text
                  style={{
                    flex: 1,
                    fontSize: theme.fontSize('md'),
                    color: done ? theme.colors.textAlt : theme.colors.text,
                    textDecorationLine: done ? 'line-through' : 'none',
                  }}
                >
                  {item.label}
                </Text>
                {done && (
                  <FontAwesomeIcon
                    icon={faCheck}
                    size={theme.fontSize('sm')}
                    style={{ color: theme.colors.accent }}
                  />
                )}
              </XView>
            </Pressable>
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
            <FontAwesomeIcon
              icon={faCircleCheck}
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
