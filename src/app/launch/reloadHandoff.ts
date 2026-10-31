import * as Notifications from 'expo-notifications'
import { adoptLaunchLink, pendingLaunchURL } from '@/lib/launchLinks'
import { logger } from '@/lib/logger'
import { mmkvStorage } from '@/stores/mmkv'

/**
 * A reload at launch (the layout-direction reload) starts a new JS context. The
 * link and the notification tap that launched the app went to the first one,
 * which only showed the splash, so the reloaded app would open Home. The first
 * context saves them here just before it reloads, and the reloaded one opens
 * them as if they had launched it.
 */
const HANDOFF_KEY = 'launch.reloadHandoff'
/** A handoff older than this is from a reload that never happened. */
const MAX_AGE_MS = 60_000

type Handoff = {
  link: string | null
  response: Notifications.NotificationResponse | null
  savedAt: number
}

let handedOffResponse: Notifications.NotificationResponse | null = null

/** Saves what launched the app for the launch after the coming reload. */
export async function handOffLaunchBeforeReload(): Promise<void> {
  const [link, response] = await Promise.all([
    pendingLaunchURL(),
    Promise.resolve()
      .then(() => Notifications.getLastNotificationResponse())
      .catch(() => null),
  ])
  if (!link && !response) return
  const handoff: Handoff = { link, response, savedAt: Date.now() }
  try {
    mmkvStorage.set(HANDOFF_KEY, JSON.stringify(handoff))
  } catch (error) {
    // The reload still fixes the layout; only the tap is lost.
    logger.warn('[launch] could not hand off the launch tap', error)
  }
}

/**
 * Picks up what the launch before a reload handed off, once, before anything
 * reads the launch link or tap.
 */
export function restoreLaunchAfterReload(): void {
  const saved = mmkvStorage.getString(HANDOFF_KEY)
  if (saved === undefined) return
  mmkvStorage.delete(HANDOFF_KEY)
  let handoff: Handoff
  try {
    handoff = JSON.parse(saved) as Handoff
  } catch {
    return
  }
  const age = Date.now() - handoff.savedAt
  if (!(age >= 0 && age < MAX_AGE_MS)) return
  if (handoff.link) adoptLaunchLink(handoff.link)
  handedOffResponse = handoff.response
}

/** Forgets a handoff when the reload doesn't happen after all. */
export function dropLaunchHandoff(): void {
  if (mmkvStorage.getString(HANDOFF_KEY) !== undefined)
    mmkvStorage.delete(HANDOFF_KEY)
}

/**
 * The notification tap handed off across the launch reload, if any. Returns it
 * once.
 */
export function takeHandedOffNotificationResponse(): Notifications.NotificationResponse | null {
  const response = handedOffResponse
  handedOffResponse = null
  return response
}
