export const START_PRECACHE = 'START_PRECACHE'

export const PRECACHE_HOLD_MAX_MS = 60_000

export type PrecacheGate = {
  open: () => void
  opened: () => Promise<void>
}

export function createPrecacheGate(
  setTimer: (run: () => void, ms: number) => unknown,
  holdMaxMs = PRECACHE_HOLD_MAX_MS
): PrecacheGate {
  let open!: () => void
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  return {
    open,
    opened: () => {
      setTimer(open, holdMaxMs)
      return gate
    },
  }
}
