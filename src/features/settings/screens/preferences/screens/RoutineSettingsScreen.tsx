import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Section from '@/components/ui/inputs/Section'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Wrapper from '@/components/ui/layout/Wrapper'
import useNotifications from '@/hooks/notifications'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { RoutineHabit } from '@/types/routine'
import HabitToggles, {
  toggledHabits,
} from '@/features/routine/components/HabitToggles'
import MeetingDaysFields from '@/features/routine/components/MeetingDaysFields'
import PersonalStudyGoalFields from '@/features/routine/components/PersonalStudyGoalFields'
import ReadingModeRow from '@/features/routine/components/ReadingModeRow'
import RoutineReminderFields from '@/features/routine/components/RoutineReminderFields'
import WorshipFields from '@/features/routine/components/WorshipFields'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

function Group({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <View>
      {title && <SectionTitle text={title} />}
      <Section>{children}</Section>
    </View>
  )
}

export default function RoutineSettingsScreen() {
  const enabled = usePreferences((s) => s.routineEnabled === true)
  const habits = usePreferences((s) => s.routineHabits)
  const meetingDays = usePreferences((s) => s.meetingDays)
  const studyGoal = usePreferences((s) => s.personalStudyGoal)
  const worshipKind = usePreferences((s) => s.worshipKind)
  const worshipDay = usePreferences((s) => s.worshipDay)
  const reminders = usePreferences((s) => s.routineReminders)
  const reminderTime = usePreferences((s) => s.routineReminderTime)
  const set = usePreferences((s) => s.set)
  const setMeetingDays = usePreferences((s) => s.setMeetingDays)
  const notifications = useNotifications()

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

  const toggleReminder = async (on: boolean) => {
    if (on && !notifications.allowed && !(await notifications.turnOn())) return
    set({ routineReminders: on })
    analytics.capture('routine_reminder_toggled', { on })
  }

  const prepares =
    habits.includes('midweekPrep') || habits.includes('weekendPrep')

  return (
    <SettingsInputLayout>
      <Wrapper insets='bottom'>
        <KeyboardAwareScrollView
          contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
          testID='routine-settings'
        >
          <Group>
            <InputRowSwitch
              label={i18n.t('routine.settings.enabled')}
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
              <Group title={i18n.t('routine.settings.reminderTitle')}>
                <RoutineReminderFields
                  enabled={reminders}
                  time={reminderTime}
                  onEnabledChange={(on) => void toggleReminder(on)}
                  onTimeChange={(time) => set({ routineReminderTime: time })}
                />
              </Group>
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
        </KeyboardAwareScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}
