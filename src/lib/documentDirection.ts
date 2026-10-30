/**
 * Lays the web page out in `direction` and `lang` at once (see
 * `documentDirection.web.ts`). iOS and Android have no page: their direction
 * applies from the next JS load, so this answers false.
 */
export function applyDocumentDirection(
  _direction: 'ltr' | 'rtl',
  _locale: string
): boolean {
  return false
}
