export const FOLLOW_PROMPT_WINDOW_MS = 60_000

export const arrivedSoonAfterOpening = (openedAt: number, now: number) =>
  now - openedAt <= FOLLOW_PROMPT_WINDOW_MS
