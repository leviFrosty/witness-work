import type { AndroidInstallTarget } from '@/constants/webInstall'

/** What the browser tells the banner about this page. */
export type InstallContext = {
  userAgent: string
  /** Running as an installed app, not in a browser tab. */
  standalone: boolean
  /** The User closed the banner (saved in the app's stores). */
  dismissed: boolean
  /** The browser offered its install prompt and it's still unused. */
  canPrompt: boolean
  /** The browser said the app got installed. */
  installed: boolean
}

/**
 * An Android phone's browser: `Android` and `Mobile` both, which Chrome leaves
 * out of a tablet's user agent. iPhones (Safari shows Apple's own banner),
 * iPads and desktops are never it.
 */
export function isAndroidPhone(userAgent: string): boolean {
  return /Android/i.test(userAgent) && /Mobile/i.test(userAgent)
}

/**
 * Whether the Install App banner shows (ADR 0037 §7). Only on an Android
 * phone's browser tab, until it's dismissed or installed. With the browser's
 * own prompt as the target, only once the browser has offered it (it doesn't on
 * a browser that can't install the app, or one that's installed it already).
 */
export function installBannerShows(
  context: InstallContext,
  target: AndroidInstallTarget
): boolean {
  if (!isAndroidPhone(context.userAgent)) return false
  if (context.standalone || context.dismissed || context.installed) return false
  return target.source === 'play' || context.canPrompt
}
