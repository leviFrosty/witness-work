import * as Linking from 'expo-linking'

let startupLink: string | null = null
let recording: { remove(): void } | null = null

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

export function linkSinceLaunch(): string | null {
  return startupLink
}

const LAUNCH_URL_TIMEOUT_MS = 2_000

export async function launchURL(): Promise<string | null> {
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
