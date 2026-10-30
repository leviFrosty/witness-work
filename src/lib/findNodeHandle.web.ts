/**
 * React-native-web throws from `findNodeHandle`. Its only use here is a target
 * for `AccessibilityInfo.setAccessibilityFocus`, which takes no handle on the
 * web, so the web finds none.
 */
export function findNodeHandle(_component: unknown): number | null {
  return null
}
