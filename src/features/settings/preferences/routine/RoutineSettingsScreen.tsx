import {
  Bell as BellIcon,
  BookOpenCheck as BookOpenCheckIcon,
} from 'lucide-react-native'
import SettingsScrollView from '@/features/settings/components/shared/SettingsScrollView'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Wrapper from '@/components/ui/layout/Wrapper'
import useNotifications from '@/hooks/notifications'
import { analytics } from '@/lib/analytics'
import { hasCapability } from '@/lib/platformCapabilities'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { RoutineHabit } from '@/types/routine'
import ReadingPlanRows from '@/features/routine/components/ReadingPlanRows'
import RoutineHabitRows, {
  type RoutineFieldChange,
  toggledHabits,
} from '@/features/routine/components/RoutineHabitRows'
import RoutineReminderFields from '@/features/routine/components/RoutineReminderFields'
import Group from '@/features/settings/components/shared/SettingsGroup'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'

export default function RoutineSettingsScreen() {
  const enabled = usePreferences((s) => s.routineEnabled === true)
  const habits = usePreferences((s) => s.routineHabits)
  const meetingDays = usePreferences((s) => s.meetingDays)
  const midweekPrepLeadDays = usePreferences((s) => s.midweekPrepLeadDays)
  const weekendPrepLeadDays = usePreferences((s) => s.weekendPrepLeadDays)
  const personalStudyGoal = usePreferences((s) => s.personalStudyGoal)
  const worshipKind = usePreferences((s) => s.worshipKind)
  const worshipDay = usePreferences((s) => s.worshipDay)
  const reminders = usePreferences((s) => s.routineReminders)
  const reminderTime = usePreferences((s) => s.routineReminderTime)
  const set = usePreferences((s) => s.set)
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

  const change = (fields: RoutineFieldChange) => {
    set(fields)
    if (fields.midweekPrepLeadDays !== undefined)
      analytics.capture('routine_prep_start_changed', {
        meeting: 'midweek',
        days_before: fields.midweekPrepLeadDays,
      })
    if (fields.weekendPrepLeadDays !== undefined)
      analytics.capture('routine_prep_start_changed', {
        meeting: 'weekend',
        days_before: fields.weekendPrepLeadDays,
      })
  }

  const toggleReminders = async (on: boolean) => {
    if (on && !notifications.allowed && !(await notifications.turnOn())) return
    set({ routineReminders: on })
    analytics.capture('routine_reminder_toggled', { on })
  }

  const canRemind = hasCapability('deviceNotifications')

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
            <Group>
              <RoutineHabitRows
                values={{
                  habits,
                  meetingDays,
                  midweekPrepLeadDays,
                  weekendPrepLeadDays,
                  worshipKind,
                  worshipDay,
                  personalStudyGoal,
                }}
                onToggleHabit={toggleHabit}
                onChange={change}
                renderReading={(last) => (
                  <ReadingPlanRows lastInSection={last} />
                )}
                lastInSection={!canRemind}
              />
              {canRemind && (
                <RoutineReminderFields
                  leftIcon={BellIcon}
                  enabled={reminders}
                  time={reminderTime}
                  onEnabledChange={(on) => void toggleReminders(on)}
                  onTimeChange={(time) => set({ routineReminderTime: time })}
                />
              )}
            </Group>
          )}
        </SettingsScrollView>
      </Wrapper>
    </SettingsInputLayout>
  )
}
