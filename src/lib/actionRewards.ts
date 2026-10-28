import type { ToastAccessory } from '@/stores/toasts'

/**
 * What saving a record earned (ADR 0035): the pet's coins, played as a combo
 * where the User is, and a tally on the toast that confirms the save. A feature
 * that rewards records registers a probe; a screen that saves one measures
 * around the save. Shared, so the screens that save don't import the features
 * that reward.
 */

/** What the User saved: Add Time, a visit, the "shared" checkbox. */
export type RewardAction = 'time' | 'visit' | 'checkbox'

/**
 * Runs right before a save and returns what runs right after it, which plays
 * what the save earned and returns the toast's accessory for it, or null.
 */
export type RewardProbe = (action: RewardAction) => () => ToastAccessory | null

const probes = new Set<RewardProbe>()

/** Adds `probe`; the returned function removes it. */
export function registerRewardProbe(probe: RewardProbe): () => void {
  probes.add(probe)
  return () => {
    probes.delete(probe)
  }
}

/**
 * Call right before saving the User's record; call what it returns right after
 * the save. That plays what it earned and returns the confirming toast's
 * `accessory`, undefined when it earned nothing.
 */
export function measureReward(
  action: RewardAction
): () => ToastAccessory | undefined {
  const afters = [...probes].map((probe) => probe(action))
  return () => {
    for (const after of afters) {
      const accessory = after()
      if (accessory) return accessory
    }
    return undefined
  }
}

let sample: (() => boolean) | null = null

/**
 * What plays a sample reward for Settings → Rewards, from the feature that
 * rewards. Returns the release.
 */
export function registerRewardSample(play: () => boolean): () => void {
  sample = play
  return () => {
    if (sample === play) sample = null
  }
}

/** Plays a sample reward; false when there's nothing to play it with. */
export const playRewardSample = (): boolean => sample?.() ?? false
