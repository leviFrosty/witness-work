import type { LaunchLinkReader } from '@/lib/launchLinkReader'
import { webLinks } from '@/lib/webLinks/webLinks'

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

export async function pendingLaunchURL(): Promise<string | null> {
  return null
}

export function addLinkListener(listener: (url: string) => void) {
  return webLinks.addLinkListener(listener)
}

export function linkOpened(url: string) {
  webLinks.opened(url)
}
