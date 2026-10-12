import { create } from 'zustand'

/**
 * The room the native tab bar takes, as measured from inside the focused tab
 * (`TabScreenLayout`). iOS floats the bar over content, at the bottom on iPhone
 * and at the top or as a sidebar on iPad. Android ends tabs above it.
 */
export type TabBarInsets = {
  /** A tab's top safe area: the status bar, plus iPad's top tab bar. */
  top: number
  /**
   * A tab's bottom safe area: the tab bar and home indicator on iPhone, the
   * home indicator on iPad, and 0 on Android, where tabs end above the bar.
   */
  bottom: number
  /**
   * How far the bar reaches up from the window's bottom edge, with the home
   * indicator or Android's navigation bar, for overlays over the whole window.
   */
  windowBottom: number
  /** A tab's width clear of the iPad sidebar, which floats over the window. */
  width: number
}

/** In memory only; null until a tab has been laid out. */
export const useTabBarInsetsStore = create<{ insets: TabBarInsets | null }>(
  () => ({ insets: null })
)

/** Stores `insets` unless they match what's already there. */
export const setTabBarInsets = (insets: TabBarInsets) => {
  const current = useTabBarInsetsStore.getState().insets
  if (
    current &&
    current.top === insets.top &&
    current.bottom === insets.bottom &&
    current.windowBottom === insets.windowBottom &&
    current.width === insets.width
  )
    return
  useTabBarInsetsStore.setState({ insets })
}
