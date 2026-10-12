export function getAdaptiveLayout(
  width: number,
  fontScale: number,
  /** Whether the native tab bar can become a sidebar; on Android it can't. */
  sidebarSupported: boolean,
  /** A tab's measured width, narrower than the window beside the sidebar. */
  tabWidth?: number
) {
  // Eligibility stays independent of visibility, so hiding the sidebar keeps
  // tablet routes such as the Settings tab.
  const hasSidebar = sidebarSupported && width >= 1000 && fontScale <= 1.3
  const contentWidth = Math.min(width, tabWidth ?? width)

  return {
    hasSidebar,
    contentWidth,
    isWide: contentWidth >= 760 && fontScale <= 1.3,
    contentMaxWidth: 1200,
  }
}
