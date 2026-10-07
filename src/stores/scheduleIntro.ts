import { create } from 'zustand'

/** What opened the Schedule intro. Bounded, safe as an analytics value. */
export type ScheduleIntroSource = 'first_visit' | 'help'

/**
 * Whether the Schedule intro is wanted (waiting for its takeover turn, or on
 * screen), and what opened it. Runtime only: `scheduleIntroSeen` in Preferences
 * keeps Schedule from opening it again.
 */
export const useScheduleIntro = create<{
  source: ScheduleIntroSource | null
  open: (source: ScheduleIntroSource) => void
  close: () => void
}>((set) => ({
  source: null,
  open: (source) => set({ source }),
  close: () => set({ source: null }),
}))
