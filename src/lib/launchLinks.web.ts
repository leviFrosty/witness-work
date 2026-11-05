import type { LaunchLinkReader } from '@/lib/launchLinkReader'
import { webLinks } from '@/lib/webLinks/webLinks'

/**
 * The web app's launch links are the contact share and Buddies invite links in
 * its own address (`/contacts#…`, `/buddies/invite#…`), which the web entry
 * takes out of the address before anything else loads, and which wait across
 * sign-in, App Lock and reloads until their listener mounts (`webLinks.ts`).
 * Each goes to its kind's listener until it opens it (`linkOpened`). React
 * Navigation reads the rest of the address itself. expo-linking isn't used: it
 * reports every `postMessage` the page receives as a `url` event for the page's
 * own address, which would reopen or reload the page. Same exports as
 * `launchLinks.ts`.
 */
export function recordLaunchLinks() {}

export function stopRecordingLaunchLinks() {}

export function adoptLaunchLink(_url: string) {}

export type { LaunchLinkReader }

export function linkSinceLaunch(reader: LaunchLinkReader): string | null {
  return webLinks.linkSinceLaunch(reader)
}

export function launchURL(reader: LaunchLinkReader): Promise<string | null> {
  return webLinks.launchURL(reader)
}

/** The web never carries a launch link across a reload this way. */
export async function pendingLaunchURL(): Promise<string | null> {
  return null
}

export function addLinkListener(listener: (url: string) => void) {
  return webLinks.addLinkListener(listener)
}

/** The listener opened `url`: it's never handed out again (`webLinks.ts`). */
export function linkOpened(url: string) {
  webLinks.opened(url)
}
