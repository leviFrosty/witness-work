import { Fragment, type ReactElement, useEffect, useState } from 'react'
import { View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import Sheet from '@/components/ui/Sheet'
import useTheme from '@/contexts/theme'
import useNotifications from '@/hooks/notifications'
import useToday from '@/hooks/useToday'
import { analytics } from '@/lib/analytics'
import { localDayKey } from '@/lib/dayKeys'
import i18n from '@/lib/locales'
import { habitName } from '@/lib/routine/habitNames'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import {
  ROUTINE_HABITS,
  type RoutineHabit,
  type WorshipKind,
} from '@/types/routine'
import PlanFields from '@/features/routine/components/PlanFields'
import { toggledHabits } from '@/features/routine/components/HabitToggles'
import {
  MidweekMeetingRow,
  PrepStartRow,
  WeekendMeetingRow,
} from '@/features/routine/components/MeetingDaysFields'
import RoutineReminderFields from '@/features/routine/components/RoutineReminderFields'
import WorshipFields from '@/features/routine/components/WorshipFields'
import { HABIT_ICONS } from '@/features/routine/lib/habitIcons'
import {
  applyPlanChoice,
  planName,
} from '@/features/routine/lib/applyPlanChoice'
import {
  DEFAULT_CUSTOM_CHOICE,
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

  const [habits, setHabits] = useState<RoutineHabit[]>([])
  const [reading, setReading] = useState<PlanChoice>({ kind: 'today' })
  const [meetingDays, setMeetingDays] = useState<number[]>(
    () => usePreferences.getState().meetingDays
  )
  const [midweekPrepLeadDays, setMidweekPrepLeadDays] = useState(
    () => usePreferences.getState().midweekPrepLeadDays
  )
  const [weekendPrepLeadDays, setWeekendPrepLeadDays] = useState(
    () => usePreferences.getState().weekendPrepLeadDays
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
    setHabits([])
    setReading({ kind: 'today' })
    setMeetingDays(current.meetingDays)
    setMidweekPrepLeadDays(current.midweekPrepLeadDays)
    setWeekendPrepLeadDays(current.weekendPrepLeadDays)
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
      midweekPrepLeadDays,
      weekendPrepLeadDays,
      worshipKind,
      worshipDay,
      routineReminders: reminders,
      routineReminderTime: reminderTime,
    })
    if (habits.includes('bibleReading')) applyPlanChoice(reading, today)
    analytics.capture('routine_enabled', {
      habits: habits.join(','),
      from: 'invite',
      ...(habits.includes('midweekPrep') && {
        midweek_prep_days_before: midweekPrepLeadDays,
      }),
      ...(habits.includes('weekendPrep') && {
        weekend_prep_days_before: weekendPrepLeadDays,
      }),
    })
    if (reminders) analytics.capture('routine_reminder_toggled', { on: true })
    onClose()
  }

  const readingOptions = [
    { label: i18n.t('routine.plan.today'), value: 'today' as const },
    ...PLAN_KINDS.map((kind) => ({ label: planName(kind), value: kind })),
  ]

  const rows: ((last: boolean) => ReactElement)[] = []
  for (const habit of ROUTINE_HABITS) {
    const on = habits.includes(habit)
    rows.push((last) => (
      <InputRowSwitch
        key={habit}
        label={habitName(habit, worshipKind)}
        leftIcon={HABIT_ICONS[habit]}
        value={on}
        onValueChange={(next) => setHabits(toggledHabits(habits, habit, next))}
        lastInSection={last}
      />
    ))
    if (!on) continue
    if (habit === 'bibleReading') {
      rows.push((last) => (
        <InputRowSelect
          key='reading'
          label={i18n.t('routine.settings.readingRow')}
          indented
          lastInSection={last}
          selectProps={{
            data: readingOptions,
            value: reading.kind,
            onChange: ({ value }) =>
              setReading(
                value === 'custom' ? DEFAULT_CUSTOM_CHOICE : { kind: value }
              ),
          }}
        />
      ))
      if (reading.kind !== 'today') {
        const plan = reading
        rows.push((last) => (
          <Fragment key='planFields'>
            <PlanFields
              choice={plan}
              onChange={setReading}
              indented
              lastInSection={last}
            />
          </Fragment>
        ))
      }
    }
    if (habit === 'midweekPrep')
      rows.push(
        () => (
          <MidweekMeetingRow
            key='midweekMeeting'
            meetingDays={meetingDays}
            onChange={setMeetingDays}
            indented
          />
        ),
        (last) => (
          <PrepStartRow
            key='midweekPrepStart'
            meeting='midweek'
            value={midweekPrepLeadDays}
            onChange={setMidweekPrepLeadDays}
            indented
            lastInSection={last}
          />
        )
      )
    if (habit === 'weekendPrep')
      rows.push(
        () => (
          <WeekendMeetingRow
            key='weekendMeeting'
            meetingDays={meetingDays}
            onChange={setMeetingDays}
            indented
          />
        ),
        (last) => (
          <PrepStartRow
            key='weekendPrepStart'
            meeting='weekend'
            value={weekendPrepLeadDays}
            onChange={setWeekendPrepLeadDays}
            indented
            lastInSection={last}
          />
        )
      )
    if (habit === 'worship')
      rows.push((last) => (
        <Fragment key='worshipFields'>
          <InputRowSelect
            label={i18n.t('routine.setup.family')}
            indented
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
            indented
            lastInSection={last}
          />
        </Fragment>
      ))
  }

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
          {rows.map((row, index) => row(index === rows.length - 1))}
        </Section>

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
