import { useMemo } from 'react'
import { Pressable, View } from 'react-native'
import {
  faCheck,
  faCircle,
  faCircleCheck,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { useNavigation } from '@react-navigation/native'
import useTheme from '../../contexts/theme'
import Text from '../MyText'
import XView from '../layout/XView'
import IconButton from '../IconButton'
import i18n from '../../lib/locales'
import { usePreferences } from '../../stores/preferences'
import useServiceReport from '../../stores/serviceReport'
import useContacts from '../../stores/contactsStore'
import { HomeTabStackNavigation } from '../../types/homeStack'
import { RootStackNavigation } from '../../types/rootStack'
import Card from '../Card'

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
  /**
   * Navigation handler invoked when the user taps the label. The checkbox
   * itself toggles manual completion separately so users can still mark an item
   * done without leaving the Home screen.
   */
  onPress?: () => void
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
    set: setPref,
  } = prefs
  const { serviceReports } = useServiceReport()
  const { contacts } = useContacts()
  const homeNavigation = useNavigation<HomeTabStackNavigation>()
  const rootNavigation = useNavigation<RootStackNavigation>()

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

  const autoCompletedIds = useMemo(() => {
    const set = new Set<HomeChecklistItemId>()
    if (hasAnyServiceReport) set.add('logFirstMinute')
    if (hasAnyContact) set.add('addFirstContact')
    return set
  }, [hasAnyServiceReport, hasAnyContact])

  const selectedItemIds = useMemo<HomeChecklistItemId[]>(() => {
    const intents: string[] = Array.isArray(onboardingIntentsRaw)
      ? onboardingIntentsRaw
      : []
    if (intents.length === 0) {
      return DEFAULT_ITEM_IDS
    }
    const mapped = intents
      .map((intent) => INTENT_TO_ITEM_ID[intent])
      .filter((id): id is HomeChecklistItemId => Boolean(id))

    // Fall back to defaults if every intent is unrecognised (e.g. a future
    // intent value added upstream) so the user still sees something useful.
    return mapped.length > 0 ? mapped : DEFAULT_ITEM_IDS
  }, [onboardingIntentsRaw])

  const items = useMemo<ChecklistItem[]>(
    () =>
      selectedItemIds.map((id) => ({
        id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        label: i18n.t(LABEL_I18N_KEY[id] as any),
        onPress: () => {
          switch (id) {
            case 'logFirstMinute':
            case 'trackTime':
              rootNavigation.navigate('Add Time')
              break
            case 'addFirstContact':
            case 'returnVisits':
              rootNavigation.navigate('Contact Form', {
                id: '',
              })
              break
            case 'setMonthlyGoal':
            case 'monthlyGoal':
              rootNavigation.navigate('PreferencesPublisher')
              break
            case 'tryTheMap':
            case 'mapContacts':
              homeNavigation.navigate('Map')
              break
            case 'planWeek':
              homeNavigation.navigate('Tools')
              break
          }
        },
      })),
    [selectedItemIds, homeNavigation, rootNavigation]
  )

  const isComplete = (id: HomeChecklistItemId) =>
    autoCompletedIds.has(id) || homeChecklistManualCompletions.includes(id)

  const toggleManualCompletion = (id: HomeChecklistItemId) => {
    // Auto-completed items can't be untoggled — their state is derived from
    // real data, not a flag.
    if (autoCompletedIds.has(id)) return
    const alreadyDone = homeChecklistManualCompletions.includes(id)
    const next = alreadyDone
      ? homeChecklistManualCompletions.filter((i) => i !== id)
      : [...homeChecklistManualCompletions, id]
    setPref({ homeChecklistManualCompletions: next })
  }

  const handleDismiss = () => setPref({ homeChecklistDismissed: true })

  const allDone = items.length > 0 && items.every((it) => isComplete(it.id))

  if (homeChecklistDismissed) return null
  if (items.length === 0) return null

  return (
    <Card>
      <XView style={{ justifyContent: 'space-between' }}>
        <Text
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('homeChecklistHeader')}
        </Text>
        <IconButton
          icon={faTimes}
          color={theme.colors.textAlt}
          onPress={handleDismiss}
        />
      </XView>
      <View style={{ gap: 10 }}>
        {items.map((item) => {
          const done = isComplete(item.id)
          return (
            <XView key={item.id} style={{ gap: 12 }}>
              <Pressable
                onPress={() => toggleManualCompletion(item.id)}
                hitSlop={8}
                accessibilityRole='checkbox'
                accessibilityState={{ checked: done }}
                accessibilityLabel={item.label}
              >
                <FontAwesomeIcon
                  icon={done ? faCircleCheck : faCircle}
                  size={theme.fontSize('xl')}
                  style={{
                    color: done ? theme.colors.accent : theme.colors.border,
                  }}
                />
              </Pressable>
              <Pressable onPress={item.onPress} style={{ flex: 1 }} hitSlop={4}>
                <Text
                  style={{
                    fontSize: theme.fontSize('md'),
                    color: done ? theme.colors.textAlt : theme.colors.text,
                    textDecorationLine: done ? 'line-through' : 'none',
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
              {done && (
                <FontAwesomeIcon
                  icon={faCheck}
                  size={theme.fontSize('sm')}
                  style={{ color: theme.colors.accent }}
                />
              )}
            </XView>
          )
        })}
      </View>
      {allDone && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            textAlign: 'center',
            marginTop: 4,
          }}
        >
          {i18n.t('homeChecklistFooter')}
        </Text>
      )}
    </Card>
  )
}

export default HomeChecklist
