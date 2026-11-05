import i18n from '@/lib/locales'
import { habitLabel } from '@/lib/routine/labels'
import type { RoutineHabit, WorshipKind } from '@/types/routine'

export const habitName = habitLabel

export const habitList = (
  habits: readonly RoutineHabit[],
  worshipKind?: WorshipKind
): string =>
  habits
    .map((habit) => habitLabel(habit, worshipKind))
    .join(i18n.t('routine.reminder.separator'))
