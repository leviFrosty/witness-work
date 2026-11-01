import { create } from 'zustand'
import { monthCelebrationKey } from '@/lib/achievementTier'

type CelebrationQueueState = {
  pending: Record<string, number>

  queue: (month: number, year: number) => void

  consume: (month: number, year: number) => number | null
}

const useCelebrationQueue = create<CelebrationQueueState>((set, get) => ({
  pending: {},
  queue: (month, year) =>
    set(({ pending }) => ({
      pending: {
        ...pending,
        [monthCelebrationKey(month, year)]: Date.now(),
      },
    })),
  consume: (month, year) => {
    const key = monthCelebrationKey(month, year)
    const t = get().pending[key]
    if (t === undefined) return null
    set(({ pending }) => {
      const { [key]: _removed, ...rest } = pending
      return { pending: rest }
    })
    return t
  },
}))

export default useCelebrationQueue
