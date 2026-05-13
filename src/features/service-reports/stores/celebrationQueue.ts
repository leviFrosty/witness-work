import { create } from 'zustand'
import { monthCelebrationKey } from '../../../lib/achievementTier'

/**
 * Cross-screen handoff for the post-submit fireworks celebration on the
 * Progress screen's Month tab. Queue entries are scoped to a specific `(month,
 * year)` so the burst only fires when the user is actually viewing the month
 * they just crossed their goal in — adding more time after the crossing, or
 * adding time that doesn't cross the goal, doesn't queue anything.
 *
 * AddTimeScreen.submit() runs the existing global Lottie + chime
 * unconditionally, but only `queue()`s a fireworks burst when the addition
 * pushes the _target month_ from below its goal to at-or-above. MonthSummary,
 * on focus (and whenever its month/year changes), `consume()`s the matching key
 * and renders multi-burst Skia fireworks. The queued timestamp lets the
 * consumer compute how much of the global Lottie is still playing so the
 * fireworks slot in _after_ it instead of stacking on top.
 *
 * Ephemeral — not persisted, not synced. The queue lives only in RAM for the
 * current session and resets on app restart.
 */
type CelebrationQueueState = {
  /**
   * Pending fireworks keyed by `YYYY-MM` (matching `monthCelebrationKey`).
   * Value is the epoch ms the entry was queued, used by the consumer to delay
   * the burst until after the global add-time animation finishes.
   */
  pending: Record<string, number>
  /** Stamp the queue for `(month, year)` with `Date.now()`. */
  queue: (month: number, year: number) => void
  /**
   * Pop the queued timestamp for `(month, year)`. Returns the value that was
   * queued, or null if no entry is pending for that month.
   */
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [key]: _removed, ...rest } = pending
      return { pending: rest }
    })
    return t
  },
}))

export default useCelebrationQueue
