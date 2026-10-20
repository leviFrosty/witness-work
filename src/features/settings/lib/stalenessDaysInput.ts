import { MIN_STALENESS_DAYS } from '@/constants/staleness'
import { isDigitsOnlyInput, parseIntegerInput } from '@/lib/digits'

/**
 * Reads a keystroke in a Color Key day field and returns the threshold to
 * store, or `null` to reject it (anything but digits). A blank field or 0 is an
 * editing step, not a value: it keeps `daysBeforeEdit`, the threshold the field
 * held when editing started, so a field cleared to type a new number neither
 * snaps its text back nor keeps the last digit deleted on the way down.
 */
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
