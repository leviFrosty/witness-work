export type GoalProgress = {
  fraction: number

  percent: number

  remaining: number

  over: number
}

export const goalProgress = ({
  minutes,
  goalMinutes,
}: {
  minutes: number
  goalMinutes: number
}): GoalProgress => {
  const rawFraction = minutes / goalMinutes

  const fraction = rawFraction < 0 ? 0 : rawFraction <= 1 ? rawFraction : 1

  const percent = rawFraction * 100

  const rawRemaining = goalMinutes - minutes
  const remaining =
    rawRemaining < 0
      ? 0
      : rawRemaining > goalMinutes
        ? goalMinutes
        : rawRemaining

  const over = Math.max(0, minutes - goalMinutes)

  return { fraction, percent, remaining, over }
}
