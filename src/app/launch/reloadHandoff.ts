import * as Notifications from 'expo-notifications'
import { adoptLaunchLink, launchURL } from '@/lib/launchLinks'
import { logger } from '@/lib/logger'
import { mmkvStorage } from '@/stores/mmkv'

const HANDOFF_KEY = 'launch.reloadHandoff'

const MAX_AGE_MS = 60_000

type Handoff = {
  link: string | null
  response: Notifications.NotificationResponse | null
  savedAt: number
}

let handedOffResponse: Notifications.NotificationResponse | null = null

export async function handOffLaunchBeforeReload(): Promise<void> {
  const [link, response] = await Promise.all([
    launchURL(),
    Promise.resolve()
      .then(() => Notifications.getLastNotificationResponse())
      .catch(() => null),
  ])
  if (!link && !response) return
  const handoff: Handoff = { link, response, savedAt: Date.now() }
  try {
    mmkvStorage.set(HANDOFF_KEY, JSON.stringify(handoff))
  } catch (error) {
    logger.warn('[launch] could not hand off the launch tap', error)
  }
}

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

export function dropLaunchHandoff(): void {
  if (mmkvStorage.getString(HANDOFF_KEY) !== undefined)
    mmkvStorage.delete(HANDOFF_KEY)
}

export function takeHandedOffNotificationResponse(): Notifications.NotificationResponse | null {
  const response = handedOffResponse
  handedOffResponse = null
  return response
}
