/**
 * The WitnessWork brand mark — an ID card holding a person and two text lines —
 * in its 650 × 506 design box. This is the exact geometry the native splash
 * draws (`splash.png`, `splash-android.xml`), so any in-app recreation lands on
 * the same pixels and the hand-off from the system splash stays invisible.
 */
export const BRAND_MARK_SIZE = { width: 650, height: 506 }

/** Card outline. Fill with the even-odd rule so the window cuts through. */
export const BRAND_MARK_CARD_PATH =
  'M72,0 H578 A72,72 0,0 1,650 72 V434 A72,72 0,0 1,578 506 H72 A72,72 0,0 1,0 434 V72 A72,72 0,0 1,72 0 Z M54,145 H596 V433 A18,18 0,0 1,578 451 H72 A18,18 0,0 1,54 433 Z'

/** Head and shoulders inside the card window. */
export const BRAND_MARK_PERSON_PATH =
  'M162,252 A72,72 0,1 0,306 252 A72,72 0,1 0,162 252 Z M108,451 A126,90 0,0 1,360 451 Z'

/** The two text lines beside the person. */
export const BRAND_MARK_LINES_PATH =
  'M423,199 H518 A25,25 0,0 1,518 249 H423 A25,25 0,0 1,423 199 Z M423,307 H518 A25,25 0,0 1,518 357 H423 A25,25 0,0 1,423 307 Z'

/**
 * Background of the native splash screen. Mirrors the `expo-splash-screen`
 * `backgroundColor` in `app.config.ts` (which can't import from `src/`).
 */
export const SPLASH_BACKGROUND_COLOR = '#4BD27C'
