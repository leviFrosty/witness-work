export const entryMinutes = ({
  hours,
  minutes,
}: {
  hours?: number
  minutes?: number
}): number => (hours || 0) * 60 + (minutes || 0)

export const splitMinutes = (
  total: number
): { hours: number; minutes: number } => ({
  hours: Math.trunc(total / 60),
  minutes: total % 60,
})
