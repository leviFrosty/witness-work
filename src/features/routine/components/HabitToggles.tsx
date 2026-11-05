import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import { habitName } from '@/lib/routine/habitNames'
import {
  ROUTINE_HABITS,
  type RoutineHabit,
  type WorshipKind,
} from '@/types/routine'

export const toggledHabits = (
  habits: readonly RoutineHabit[],
  habit: RoutineHabit,
  on: boolean
): RoutineHabit[] =>
  ROUTINE_HABITS.filter((other) =>
    other === habit ? on : habits.includes(other)
  )

export default function HabitToggles({
  habits,
  worshipKind,
  onToggle,
  lastInSection = true,
}: {
  habits: readonly RoutineHabit[]
  worshipKind: WorshipKind
  onToggle: (habit: RoutineHabit, on: boolean) => void
  lastInSection?: boolean
}) {
  return (
    <>
      {ROUTINE_HABITS.map((habit, index) => (
        <InputRowSwitch
          key={habit}
          label={habitName(habit, worshipKind)}
          value={habits.includes(habit)}
          onValueChange={(on) => onToggle(habit, on)}
          lastInSection={lastInSection && index === ROUTINE_HABITS.length - 1}
        />
      ))}
    </>
  )
}
