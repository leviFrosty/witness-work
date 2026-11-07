import * as Linking from 'expo-linking'
import type { LaunchLinkReader } from '@/lib/launchLinkReader'

export type { LaunchLinkReader }

let startupLink: string | null = null
let recording: { remove(): void } | null = null

const handedOut = new Map<LaunchLinkReader, string>()

function handOut(reader: LaunchLinkReader, url: string | null): string | null {
  if (!url || handedOut.get(reader) === url) return null
  handedOut.set(reader, url)
  return url
}

export function recordLaunchLinks() {
  if (recording) return
  recording = Linking.addEventListener('url', ({ url }) => {
    startupLink = url
  })
}

export function stopRecordingLaunchLinks() {
  recording?.remove()
  recording = null
}

export function adoptLaunchLink(url: string) {
  startupLink ??= url
}

export function addLinkListener(listener: (url: string) => void) {
  return Linking.addEventListener('url', ({ url }) => listener(url))
}

export function linkSinceLaunch(reader: LaunchLinkReader): string | null {
  return handOut(reader, startupLink)
}

const LAUNCH_URL_TIMEOUT_MS = 2_000

export async function launchURL(
  reader: LaunchLinkReader
): Promise<string | null> {
  return handOut(reader, await pendingLaunchURL())
}

export async function pendingLaunchURL(): Promise<string | null> {
  const link = startupLink
  if (link) return link
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LAUNCH_URL_TIMEOUT_MS)
  })
  try {
    return await Promise.race([
      Linking.getInitialURL().catch(() => null),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }
}

export function linkOpened(_url: string) {}
