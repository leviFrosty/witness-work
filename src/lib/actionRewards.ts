import type { ToastAccessory } from '@/stores/toasts'

export type RewardAction = 'time' | 'visit' | 'checkbox'

export type RewardProbe = (action: RewardAction) => () => ToastAccessory | null

const probes = new Set<RewardProbe>()

export function registerRewardProbe(probe: RewardProbe): () => void {
  probes.add(probe)
  return () => {
    probes.delete(probe)
  }
}

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

export function registerRewardSample(play: () => boolean): () => void {
  sample = play
  return () => {
    if (sample === play) sample = null
  }
}

export const playRewardSample = (): boolean => sample?.() ?? false
