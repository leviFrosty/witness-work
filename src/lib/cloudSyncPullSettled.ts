let completed = false
let generation = 0
const listeners = new Set<() => void>()

const notify = () => {
  for (const listener of [...listeners]) listener()
}

export const completedPullThisLaunch = (): boolean => completed

export const completePullGeneration = (): number => generation

export function markCompletePull(startedIn: number = generation): void {
  if (startedIn !== generation) return
  completed = true
  notify()
}

export function resetCompletePull(): void {
  generation++
  if (!completed) return
  completed = false
  notify()
}

export const onCompletedPull = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
