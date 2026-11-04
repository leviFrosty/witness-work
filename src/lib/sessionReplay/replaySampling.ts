/**
 * Which web sessions are recorded (ADR 0043). Each browser tab session draws a
 * number once and keeps it, so a reload or a route change never re-rolls it and
 * a session is wholly in or out of the sample. A tab that can't keep the draw
 * (private browsing with storage blocked) keeps it in memory for the page.
 */

/** Share of web sessions that are recorded. */
export const REPLAY_SAMPLE_RATE = 0.1

const STORAGE_KEY = 'ww-replay-draw'

type DrawStorage = Pick<Storage, 'getItem' | 'setItem'>

let memoryDraw: number | undefined

const parseDraw = (value: string | null): number | undefined => {
  if (value === null) return undefined
  const draw = Number(value)
  return Number.isFinite(draw) && draw >= 0 && draw < 1 ? draw : undefined
}

/**
 * This session's draw in [0, 1): the stored one, or a new one kept for next
 * time.
 */
export const sessionDraw = (
  storage: DrawStorage | undefined,
  random: () => number = Math.random
): number => {
  try {
    const stored = parseDraw(storage?.getItem(STORAGE_KEY) ?? null)
    if (stored !== undefined) return stored
  } catch {
    // Storage blocked: use the page's own draw.
  }
  memoryDraw ??= random()
  try {
    storage?.setItem(STORAGE_KEY, String(memoryDraw))
  } catch {
    // Not kept past this page.
  }
  return memoryDraw
}

export const sessionSampled = (
  rate: number,
  storage: DrawStorage | undefined,
  random: () => number = Math.random
): boolean => rate > 0 && sessionDraw(storage, random) < rate

/** For tests: forget the page's draw. */
export const resetSessionDraw = (): void => {
  memoryDraw = undefined
}
