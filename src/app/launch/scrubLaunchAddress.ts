/**
 * The web entry's first step (`scrubLaunchAddress.web.ts`). A native app has no
 * address to scrub, so it always goes on to load.
 */
export function scrubLaunchAddress(): boolean {
  return true
}
