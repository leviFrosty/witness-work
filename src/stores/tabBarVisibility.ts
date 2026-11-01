import { create } from 'zustand'

type TabBarVisibilityStore = {
  claims: number

  claim: () => () => void
}

export const useTabBarVisibility = create<TabBarVisibilityStore>((set) => ({
  claims: 0,
  claim: () => {
    set((s) => ({ claims: s.claims + 1 }))
    let released = false
    return () => {
      if (released) return
      released = true
      set((s) => ({ claims: Math.max(0, s.claims - 1) }))
    }
  },
}))

export const useTabBarHidden = () => useTabBarVisibility((s) => s.claims > 0)
