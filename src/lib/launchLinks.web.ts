import type { LaunchLinkReader } from '@/lib/launchLinkReader'

/**
 * The web app has no launch links. The page's own address is what a native
 * launch link would be, and React Navigation reads it itself; expo-linking
 * would also report every `postMessage` the page receives as a `url` event for
 * that address. Treating either as a link from outside would reopen or reload
 * the page. Same exports as `launchLinks.ts`.
 */
export function recordLaunchLinks() {}

export function stopRecordingLaunchLinks() {}

export function adoptLaunchLink(_url: string) {}

export type { LaunchLinkReader }

export function linkSinceLaunch(_reader: LaunchLinkReader): string | null {
  return null
}

export async function launchURL(
  _reader: LaunchLinkReader
): Promise<string | null> {
  return null
}

export async function pendingLaunchURL(): Promise<string | null> {
  return null
}

export function addLinkListener(_listener: (url: string) => void) {
  return { remove() {} }
}
