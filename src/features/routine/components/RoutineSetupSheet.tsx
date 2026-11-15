import { useEffect, useState } from 'react'
import { View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import Sheet from '@/components/ui/Sheet'
import useTheme from '@/contexts/theme'
import useNotifications from '@/hooks/notifications'
import useToday from '@/hooks/useToday'
import { analytics } from '@/lib/analytics'
import { localDayKey } from '@/lib/dayKeys'
import i18n from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import PlanFields from '@/features/routine/components/PlanFields'
import RoutineHabitRows, {
  type RoutineFieldValues,
  toggledHabits,
} from '@/features/routine/components/RoutineHabitRows'
import RoutineReminderFields from '@/features/routine/components/RoutineReminderFields'
import {
  applyPlanChoice,
  planName,
} from '@/features/routine/lib/applyPlanChoice'
import {
  DEFAULT_CUSTOM_CHOICE,
  PLAN_KINDS,
  type PlanChoice,
} from '@/features/routine/lib/readingPlanChoice'

const initialValues = (): RoutineFieldValues => {
  const current = usePreferences.getState()
  return {
    habits: [],
    meetingDays: current.meetingDays,
    midweekPrepLeadDays: current.midweekPrepLeadDays,
    weekendPrepLeadDays: current.weekendPrepLeadDays,
    worshipKind: current.worshipKind,
    worshipDay: current.worshipDay,
    personalStudyGoal: current.personalStudyGoal,
  }
}

function SheetHeading({ text }: { text: string }) {
  const theme = useTheme()
  return (
    <Text
      accessibilityRole='header'
      style={{
        fontFamily: theme.fonts.semiBold,
        fontSize: theme.fontSize('sm'),
        color: theme.colors.textAlt,
        marginBottom: -8,
      }}
    >
      {text}
    </Text>
  )
}

export default function RoutineSetupSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const theme = useTheme()
  const today = localDayKey(useToday())
  const hasPet = usePet((state) => state.pet !== null)
  const notifications = useNotifications()

  const [values, setValues] = useState(initialValues)
  const [reading, setReading] = useState<PlanChoice>({ kind: 'today' })
  const [reminders, setReminders] = useState(false)
  const [reminderTime, setReminderTime] = useState(
    () => usePreferences.getState().routineReminderTime
  )

  useEffect(() => {
    if (!open) return
    setValues(initialValues())
    setReading({ kind: 'today' })
    setReminders(false)
    setReminderTime(usePreferences.getState().routineReminderTime)
  }, [open])

  const turnOnReminders = async (next: boolean) => {
    if (next && !notifications.allowed && !(await notifications.turnOn()))
      return
    setReminders(next)
  }

  const save = () => {
    const { habits, ...fields } = values
    const { set } = usePreferences.getState()
    set({
      ...fields,
      routineEnabled: true,
      routineHabits: habits,
      routineReminders: reminders,
      routineReminderTime: reminderTime,
    })
    if (habits.includes('bibleReading')) applyPlanChoice(reading, today)
    analytics.capture('routine_enabled', {
      habits: habits.join(','),
      from: 'invite',
      ...(habits.includes('midweekPrep') && {
        midweek_prep_days_before: fields.midweekPrepLeadDays,
      }),
      ...(habits.includes('weekendPrep') && {
        weekend_prep_days_before: fields.weekendPrepLeadDays,
      }),
    })
    if (reminders) analytics.capture('routine_reminder_toggled', { on: true })
    onClose()
  }

  const readingOptions = [
    { label: i18n.t('routine.plan.today'), value: 'today' as const },
    ...PLAN_KINDS.map((kind) => ({ label: planName(kind), value: kind })),
  ]

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <Sheet.ScrollView
        contentContainerStyle={{ padding: 20, gap: 20 }}
        testID='routine-setup-sheet'
      >
        <View style={{ gap: 6 }}>
          <Text
            accessibilityRole='header'
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('routine.setup.title')}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              lineHeight: theme.fontSize('sm') * 1.4,
            }}
          >
            {i18n.t('routine.setup.subtitle')}
            {hasPet ? ` ${i18n.t('routine.setup.petCoins')}` : ''}
          </Text>
        </View>

        <SheetHeading text={i18n.t('routine.setup.habits')} />
        <Section>
          <RoutineHabitRows
            values={values}
            onToggleHabit={(habit, on) =>
              setValues((current) => ({
                ...current,
                habits: toggledHabits(current.habits, habit, on),
              }))
            }
            onChange={(change) =>
              setValues((current) => ({ ...current, ...change }))
            }
            renderReading={(last) => (
              <>
                <InputRowSelect
                  label={i18n.t('routine.settings.readingRow')}
                  indented
                  lastInSection={last && reading.kind === 'today'}
                  selectProps={{
                    data: readingOptions,
                    value: reading.kind,
                    onChange: ({ value }) =>
                      setReading(
                        value === 'custom'
                          ? DEFAULT_CUSTOM_CHOICE
                          : { kind: value }
                      ),
                  }}
                />
                {reading.kind !== 'today' && (
                  <PlanFields
                    choice={reading}
                    onChange={setReading}
                    indented
                    lastInSection={last}
                  />
                )}
              </>
            )}
          />
        </Section>

        {hasCapability('deviceNotifications') && (
          <Section>
            <RoutineReminderFields
              enabled={reminders}
              time={reminderTime}
              onEnabledChange={(next) => void turnOnReminders(next)}
              onTimeChange={setReminderTime}
            />
          </Section>
        )}

        <ActionButton
          onPress={save}
          disabled={values.habits.length === 0}
          testID='routine-setup-save'
        >
          {i18n.t('routine.setup.save')}
        </ActionButton>
      </Sheet.ScrollView>
    </Sheet>
  )
}
