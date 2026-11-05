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
import { DEFAULT_CHAPTERS_PER_DAY } from '@/lib/routine/readingPlans'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import {
  ROUTINE_HABITS,
  type RoutineHabit,
  type WorshipKind,
} from '@/types/routine'
import CustomPlanFields from '@/features/routine/components/CustomPlanFields'
import HabitToggles, {
  toggledHabits,
} from '@/features/routine/components/HabitToggles'
import MeetingDaysFields from '@/features/routine/components/MeetingDaysFields'
import RoutineReminderFields from '@/features/routine/components/RoutineReminderFields'
import WorshipFields from '@/features/routine/components/WorshipFields'
import {
  applyPlanChoice,
  planName,
} from '@/features/routine/lib/applyPlanChoice'
import {
  PLAN_KINDS,
  type PlanChoice,
} from '@/features/routine/lib/readingPlanChoice'

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

  const [habits, setHabits] = useState<RoutineHabit[]>([...ROUTINE_HABITS])
  const [reading, setReading] = useState<PlanChoice>({ kind: 'today' })
  const [meetingDays, setMeetingDays] = useState<number[]>(
    () => usePreferences.getState().meetingDays
  )
  const [worshipKind, setWorshipKind] = useState<WorshipKind>(
    () => usePreferences.getState().worshipKind
  )
  const [worshipDay, setWorshipDay] = useState<number | null>(
    () => usePreferences.getState().worshipDay
  )
  const [reminders, setReminders] = useState(false)
  const [reminderTime, setReminderTime] = useState(
    () => usePreferences.getState().routineReminderTime
  )

  useEffect(() => {
    if (!open) return
    const current = usePreferences.getState()
    setHabits([...ROUTINE_HABITS])
    setReading({ kind: 'today' })
    setMeetingDays(current.meetingDays)
    setWorshipKind(current.worshipKind)
    setWorshipDay(current.worshipDay)
    setReminders(false)
    setReminderTime(current.routineReminderTime)
  }, [open])

  const turnOnReminders = async (next: boolean) => {
    if (next && !notifications.allowed && !(await notifications.turnOn()))
      return
    setReminders(next)
  }

  const save = () => {
    const { set } = usePreferences.getState()
    set({
      routineEnabled: true,
      routineHabits: habits,
      meetingDays,
      worshipKind,
      worshipDay,
      routineReminders: reminders,
      routineReminderTime: reminderTime,
    })
    if (habits.includes('bibleReading')) applyPlanChoice(reading, today)
    analytics.capture('routine_enabled', {
      habits: habits.join(','),
      from: 'invite',
    })
    if (reminders) analytics.capture('routine_reminder_toggled', { on: true })
    onClose()
  }

  const readingOptions = [
    { label: i18n.t('routine.plan.today'), value: 'today' as const },
    ...PLAN_KINDS.map((kind) => ({ label: planName(kind), value: kind })),
  ]
  const prepares =
    habits.includes('midweekPrep') || habits.includes('weekendPrep')

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
          <HabitToggles
            habits={habits}
            worshipKind={worshipKind}
            onToggle={(habit, on) =>
              setHabits(toggledHabits(habits, habit, on))
            }
          />
        </Section>

        {habits.includes('bibleReading') && (
          <>
            <SheetHeading text={i18n.t('routine.plan.title')} />
            <Section>
              <InputRowSelect
                label={i18n.t('routine.settings.readingRow')}
                lastInSection={reading.kind !== 'custom'}
                selectProps={{
                  data: readingOptions,
                  value: reading.kind,
                  onChange: ({ value }) =>
                    setReading(
                      value === 'custom'
                        ? {
                            kind: 'custom',
                            startBook: 0,
                            chaptersPerDay: DEFAULT_CHAPTERS_PER_DAY,
                          }
                        : { kind: value }
                    ),
                }}
              />
              {reading.kind === 'custom' && (
                <CustomPlanFields
                  startBook={reading.startBook}
                  chaptersPerDay={reading.chaptersPerDay}
                  onChange={(next) => setReading({ kind: 'custom', ...next })}
                  lastInSection
                />
              )}
            </Section>
          </>
        )}

        {prepares && (
          <>
            <SheetHeading text={i18n.t('routine.meetings.title')} />
            <Section>
              <MeetingDaysFields
                meetingDays={meetingDays}
                onChange={setMeetingDays}
                lastInSection
              />
            </Section>
          </>
        )}

        {habits.includes('worship') && (
          <>
            <SheetHeading text={i18n.t('routine.settings.worshipTitle')} />
            <Section>
              <InputRowSelect
                label={i18n.t('routine.setup.family')}
                selectProps={{
                  data: [
                    { label: i18n.t('yes'), value: 'family' as const },
                    { label: i18n.t('no'), value: 'personal' as const },
                  ],
                  value: worshipKind,
                  onChange: ({ value }) => setWorshipKind(value),
                }}
              />
              <WorshipFields
                kind={worshipKind}
                day={worshipDay}
                onKindChange={setWorshipKind}
                onDayChange={setWorshipDay}
                showKind={false}
                lastInSection
              />
            </Section>
          </>
        )}

        <Section>
          <RoutineReminderFields
            enabled={reminders}
            time={reminderTime}
            onEnabledChange={(next) => void turnOnReminders(next)}
            onTimeChange={setReminderTime}
          />
        </Section>

        <ActionButton
          onPress={save}
          disabled={habits.length === 0}
          testID='routine-setup-save'
        >
          {i18n.t('routine.setup.save')}
        </ActionButton>
      </Sheet.ScrollView>
    </Sheet>
  )
}
