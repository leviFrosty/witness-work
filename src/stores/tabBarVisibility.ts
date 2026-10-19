import { create } from 'zustand'

/**
 * Ephemeral, non-persisted visibility of the floating bottom tab bar. A focused
 * screen claims it hidden (scrolling down, exploring the map) and releases the
 * claim when it no longer wants that or loses focus, so a screen that never
 * claims always finds the bar showing. The sidebar ignores it.
 */
type TabBarVisibilityStore = {
  claims: number
  /** Hides the bar until the returned release is called. */
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
