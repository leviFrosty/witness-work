import type { AssistantEvent } from '@/types/assistant'

export type RecommendationInputsHashInput = {
  loggedAdjustedMinutes: number
  dayPlanFingerprints: string[]
  recurringPlanFingerprints: string[]
  conversationDayKeys: string[]
  excludedWeekdays: number[]
}

/**
 * Cheap deterministic fingerprint of every input that should re-arm the
 * Assistant after the user dismissed a recommendation. Two identical input
 * states must produce the same hash regardless of array order — so we sort the
 * set-like fields before stringifying.
 */
export const computeRecommendationInputsHash = (
  input: RecommendationInputsHashInput
): string => {
  const parts: (string | number)[] = [
    'v1',
    input.loggedAdjustedMinutes,
    input.dayPlanFingerprints.slice().sort().join('|'),
    input.recurringPlanFingerprints.slice().sort().join('|'),
    input.conversationDayKeys.slice().sort().join('|'),
    input.excludedWeekdays
      .slice()
      .sort((a, b) => a - b)
      .join(','),
  ]
  return parts.join('::')
}

/**
 * Append a new assistant event to history, dropping the oldest entry when the
 * FIFO would exceed `cap`. Pure — caller writes the result back to the
 * preferences store.
 */
export const appendAssistantEventCapped = (
  history: AssistantEvent[],
  next: AssistantEvent,
  cap: number
): AssistantEvent[] => {
  const appended = [...history, next]
  if (appended.length <= cap) return appended
  return appended.slice(appended.length - cap)
}
