export const REPLAY_SAMPLE_RATE = 0.1

const STORAGE_KEY = 'ww-replay-draw'

type DrawStorage = Pick<Storage, 'getItem' | 'setItem'>

let memoryDraw: number | undefined

const parseDraw = (value: string | null): number | undefined => {
  if (value === null) return undefined
  const draw = Number(value)
  return Number.isFinite(draw) && draw >= 0 && draw < 1 ? draw : undefined
}

export const sessionDraw = (
  storage: DrawStorage | undefined,
  random: () => number = Math.random
): number => {
  try {
    const stored = parseDraw(storage?.getItem(STORAGE_KEY) ?? null)
    if (stored !== undefined) return stored
  } catch {}
  memoryDraw ??= random()
  try {
    storage?.setItem(STORAGE_KEY, String(memoryDraw))
  } catch {}
  return memoryDraw
}

export const sessionSampled = (
  rate: number,
  storage: DrawStorage | undefined,
  random: () => number = Math.random
): boolean => rate > 0 && sessionDraw(storage, random) < rate

export const resetSessionDraw = (): void => {
  memoryDraw = undefined
}
