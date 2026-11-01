import { MIN_STALENESS_DAYS } from '@/constants/staleness'
import { isDigitsOnlyInput, parseIntegerInput } from '@/lib/digits'

export function readStalenessDaysInput(
  text: string,
  daysBeforeEdit: number
): number | null {
  if (!isDigitsOnlyInput(text)) return null
  const days = parseIntegerInput(text)
  return days !== undefined && days >= MIN_STALENESS_DAYS
    ? days
    : daysBeforeEdit
}
