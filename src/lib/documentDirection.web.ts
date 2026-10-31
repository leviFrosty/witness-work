/**
 * The browser lays the page out from the root element's `dir` and reads it in
 * `lang`, and both apply at once, with no reload. True: the direction is
 * already in effect.
 */
export function applyDocumentDirection(
  direction: 'ltr' | 'rtl',
  locale: string
): boolean {
  document.documentElement.dir = direction
  document.documentElement.lang = locale
  return true
}
