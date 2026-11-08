import { useNavigation } from '@react-navigation/native'
import { BookOpenCheck as BookOpenCheckIcon } from 'lucide-react-native'
import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Wrapper from '@/components/ui/layout/Wrapper'
import { analytics } from '@/lib/analytics'
import { hasCapability } from '@/lib/platformCapabilities'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { RoutineHabit } from '@/types/routine'
import HabitToggles, {
  toggledHabits,
} from '@/features/routine/components/HabitToggles'
import MeetingDaysFields from '@/features/routine/components/MeetingDaysFields'
import PersonalStudyGoalFields from '@/features/routine/components/PersonalStudyGoalFields'
import ReadingModeRow from '@/features/routine/components/ReadingModeRow'
import WorshipFields from '@/features/routine/components/WorshipFields'
import Group from '@/features/settings/components/shared/SettingsGroup'
import SettingsRowValue from '@/features/settings/components/shared/SettingsRowValue'
import useSettingsSearchTarget from '@/features/settings/stores/settingsSearchTarget'
import type { RootStackNavigation } from '@/types/rootStack'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

export default function RoutineSettingsScreen() {
  const enabled = usePreferences((s) => s.routineEnabled === true)
  const habits = usePreferences((s) => s.routineHabits)
  const meetingDays = usePreferences((s) => s.meetingDays)
  const studyGoal = usePreferences((s) => s.personalStudyGoal)
  const worshipKind = usePreferences((s) => s.worshipKind)
  const worshipDay = usePreferences((s) => s.worshipDay)
  const reminders = usePreferences((s) => s.routineReminders)
  const set = usePreferences((s) => s.set)
  const setMeetingDays = usePreferences((s) => s.setMeetingDays)
  const navigation = useNavigation<RootStackNavigation>()
  const requestTarget = useSettingsSearchTarget((state) => state.request)

  const toggleRoutine = (on: boolean) => {
    set({ routineEnabled: on })
    if (on)
      analytics.capture('routine_enabled', {
        habits: habits.join(','),
        from: 'settings',
      })
    else analytics.capture('routine_disabled')
  }

  const toggleHabit = (habit: RoutineHabit, on: boolean) => {
    set({ routineHabits: toggledHabits(habits, habit, on) })
    analytics.capture('routine_habit_toggled', { habit, on })
  }

  const prepares =
    habits.includes('midweekPrep') || habits.includes('weekendPrep')

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <SettingsScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
          testID='routine-settings'
        >
          <Group>
            <InputRowSwitch
              label={i18n.t('routine.settings.enabled')}
              leftIcon={BookOpenCheckIcon}
              info={i18n.t('routine.settings.enabledInfo')}
              value={enabled}
              onValueChange={toggleRoutine}
              lastInSection
            />
          </Group>
          {enabled && (
            <>
              <Group title={i18n.t('routine.settings.habitsTitle')}>
                <HabitToggles
                  habits={habits}
                  worshipKind={worshipKind}
                  onToggle={toggleHabit}
                />
              </Group>
              {habits.includes('bibleReading') && (
                <Group title={i18n.t('routine.settings.readingTitle')}>
                  <ReadingModeRow />
                </Group>
              )}
              {habits.includes('personalStudy') && (
                <Group title={i18n.t('routine.settings.studyTitle')}>
                  <PersonalStudyGoalFields
                    goal={studyGoal}
                    onChange={(goal) => set({ personalStudyGoal: goal })}
                    lastInSection
                  />
                </Group>
              )}
              {habits.includes('worship') && (
                <Group title={i18n.t('routine.settings.worshipTitle')}>
                  <WorshipFields
                    kind={worshipKind}
                    day={worshipDay}
                    onKindChange={(kind) => set({ worshipKind: kind })}
                    onDayChange={(day) => set({ worshipDay: day })}
                    lastInSection
                  />
                </Group>
              )}
              {hasCapability('deviceNotifications') && (
                <Group title={i18n.t('routine.settings.reminderTitle')}>
                  <InputRowButton
                    label={i18n.t('routine.reminder.label')}
                    onPress={() => {
                      requestTarget('routineReminder')
                      navigation.navigate('PreferencesNotifications')
                    }}
                    lastInSection
                  >
                    <SettingsRowValue
                      value={i18n.t(reminders ? 'settingOn' : 'settingOff')}
                    />
                  </InputRowButton>
                </Group>
              )}
            </>
          )}
          {(!enabled || prepares) && (
            <Group title={i18n.t('routine.meetings.title')}>
              <MeetingDaysFields
                meetingDays={meetingDays}
                onChange={setMeetingDays}
                lastInSection
              />
            </Group>
          )}
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}
