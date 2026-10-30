import * as Linking from 'expo-linking'

/**
 * A link tapped while the app is still starting (a widget day, a shared
 * contact, a Buddies invite) arrives as a `url` event before anything listens
 * for one, and React Native drops events nobody listens to. From the moment the
 * bundle loads, the newest such link is kept here, and it opens in place of the
 * one that launched the app.
 */
let startupLink: string | null = null
let recording: { remove(): void } | null = null

/** Starts keeping links that come while the app starts. Call once, first. */
export function recordLaunchLinks() {
  if (recording) return
  recording = Linking.addEventListener('url', ({ url }) => {
    startupLink = url
  })
}

/** Stops keeping them, once the app's own link listeners are up. */
export function stopRecordingLaunchLinks() {
  recording?.remove()
  recording = null
}

/**
 * Opens `url` at launch as if it had come while the app started, unless a link
 * already has: the link a launch handed across its reload.
 */
export function adoptLaunchLink(url: string) {
  startupLink ??= url
}

/**
 * Calls `listener` with each link opened while the app runs. Use it in place of
 * `Linking.addEventListener('url', …)`; the web build has none
 * (`launchLinks.web.ts`).
 */
export function addLinkListener(listener: (url: string) => void) {
  return Linking.addEventListener('url', ({ url }) => listener(url))
}

/** The newest link that came while the app was starting, if any. */
export function linkSinceLaunch(): string | null {
  return startupLink
}

/**
 * How long the launch URL may take. React Navigation's own default gives up
 * after 150 ms, which a busy cold start can overrun, opening Home instead.
 */
const LAUNCH_URL_TIMEOUT_MS = 2_000

/**
 * The link the app should open at launch: one tapped while it was starting,
 * else the one that launched it. Use it in place of `Linking.getInitialURL`.
 */
export async function launchURL(): Promise<string | null> {
  const link = startupLink
  if (link) return link
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LAUNCH_URL_TIMEOUT_MS)
  })
  try {
    // A link that comes while this waits goes to the caller's own `url`
    // listener, or, for navigation, to `linkSinceLaunch`.
    return await Promise.race([
      Linking.getInitialURL().catch(() => null),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }
}
