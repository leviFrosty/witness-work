import { create } from 'zustand'

export type ScheduleIntroPageId = 'plan' | 'streak' | 'grace' | 'together'

export type ScheduleIntroSource = 'first_visit'

export const useScheduleIntro = create<{
  source: ScheduleIntroSource | null
  open: (source: ScheduleIntroSource) => void
  close: () => void
}>((set) => ({
  source: null,
  open: (source) => set({ source }),
  close: () => set({ source: null }),
}))
