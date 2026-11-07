export function applyDocumentDirection(
  direction: 'ltr' | 'rtl',
  locale: string
): boolean {
  document.documentElement.dir = direction
  document.documentElement.lang = locale
  return true
}
