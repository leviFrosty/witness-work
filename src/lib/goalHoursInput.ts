import { parseDecimalInput } from '@/lib/digits'

export function committedGoalHours(
  text: string,
  { saved, fallback }: { saved: number; fallback: number }
): number {
  if (!text.trim()) return fallback
  return parseDecimalInput(text) ?? saved
}
