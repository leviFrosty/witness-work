/**
 * Whether this launch has read the account's Cloud Sync data in full (ADR 0040
 * §7; docs/web-purchases.md, "Which RevenueCat customer the web uses"): a pull
 * that listed every slot and opened every other device's, so the peers'
 * RevenueCat claims it handed `AccountProvider` are all of them. An empty
 * account, or one holding only this device's own slot, counts: there's no other
 * claim to wait for.
 *
 * In memory only, so it starts unset every launch (a browser that signs out
 * reloads), and it's reset when the account changes. Free of native imports.
 */

let completed = false
let generation = 0
const listeners = new Set<() => void>()

const notify = () => {
  for (const listener of [...listeners]) listener()
}

/** Whether a complete Cloud Sync pull finished since launch or the last reset. */
export const completedPullThisLaunch = (): boolean => completed

/**
 * The current account's generation, taken when a pull starts and passed to
 * `markCompletePull`, so a pull that started before a reset doesn't count.
 */
export const completePullGeneration = (): number => generation

/**
 * A complete pull finished, after it set the peers' claims. `startedIn` is
 * `completePullGeneration()` from when it started; a pull from before a reset
 * is ignored. Listeners hear every complete pull, not only the first.
 */
export function markCompletePull(startedIn: number = generation): void {
  if (startedIn !== generation) return
  completed = true
  notify()
}

/**
 * Another account, or none: what was read was another account's. Listeners hear
 * it too, so a view of `completedPullThisLaunch` can update.
 */
export function resetCompletePull(): void {
  generation++
  if (!completed) return
  completed = false
  notify()
}

/**
 * Calls `listener` after each complete pull, and when a reset clears it: read
 * `completedPullThisLaunch()` there. Returns the unsubscribe.
 */
export const onCompletedPull = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
