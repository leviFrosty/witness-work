export const SIDEBAR_MIN_WIDTH = 88
export const SIDEBAR_MAX_WIDTH = 360
export const SIDEBAR_DEFAULT_WIDTH = 240
export const SIDEBAR_LABEL_MIN_WIDTH = 220
export const SIDEBAR_RESIZE_STEP = 24

export const clampSidebarWidth = (width: number) => {
  'worklet'
  return Number.isFinite(width)
    ? Math.round(
        Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
      )
    : SIDEBAR_DEFAULT_WIDTH
}

export function getAdaptiveLayout(
  width: number,
  fontScale: number,
  preferredSidebarWidth: number,
  sidebarHidden: boolean
) {
  // Eligibility stays independent of visibility, preserving tablet routes
  // and keeping the bottom bar out of the way while the sidebar is hidden.
  const hasSidebar = width >= 1000 && fontScale <= 1.3
  const sidebarVisible = hasSidebar && !sidebarHidden
  const sidebarWidth = sidebarVisible
    ? clampSidebarWidth(preferredSidebarWidth)
    : 0
  const contentWidth = width - sidebarWidth

  return {
    hasSidebar,
    sidebarVisible,
    sidebarCompact: sidebarVisible && sidebarWidth < SIDEBAR_LABEL_MIN_WIDTH,
    sidebarWidth,
    contentWidth,
    isWide: contentWidth >= 760 && fontScale <= 1.3,
    contentMaxWidth: 1200,
  }
}
