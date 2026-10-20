import { parseDecimalInput } from '@/lib/digits'

/**
 * The goal (hours) a typed goal field saves. A cleared field goes back to the
 * role's default goal; text that isn't a number keeps the saved goal.
 */
export function committedGoalHours(
  text: string,
  { saved, fallback }: { saved: number; fallback: number }
): number {
  if (!text.trim()) return fallback
  return parseDecimalInput(text) ?? saved
}
