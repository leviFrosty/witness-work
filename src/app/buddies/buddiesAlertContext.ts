import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import apis from '@/constants/apis'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { activeDateConventions } from '@/lib/dates'
import { _i18n } from '@/lib/locales'
import { logger } from '@/lib/logger'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'

/** Writes wait for changes to settle this long. */
const WRITE_DEBOUNCE_MS = 1000

/**
 * What the iOS Notification Service Extension reads to word Buddies alerts: the
 * alert context (the keys that open buddies' events, their names here, and when
 * shared Plans and Follow-ups are), where to fetch an event too big for the
 * push, and the app's language and date conventions. Null when there's nothing
 * to word: Buddies not started here, or its notifications off.
 */
export function buddiesAlertSnapshot(): string | null | undefined {
  const { registeredInboxId, notificationsEnabled } = useBuddies.getState()
  if (registeredInboxId === null || !notificationsEnabled) return null
  const context = buddiesEngine.alertContext()
  // The seed isn't read yet: not "nothing to word", so keep what's there.
  if (context === undefined) return undefined
  if (!context) return null
  return JSON.stringify({
    ...context,
    relay: apis.buddies,
    display: { language: _i18n.locale, ...activeDateConventions() },
  })
}

/** What the Keychain holds now, so an unchanged snapshot isn't written again. */
let written: string | null | undefined

/** Hands the extension the current snapshot, or clears it. */
export function writeBuddiesAlertContext() {
  if (!BuddiesKeychain.isAlertContextAvailable()) return
  let snapshot: string | null | undefined
  try {
    snapshot = buddiesAlertSnapshot()
  } catch (error) {
    logger.warn('[buddies] alert context', error)
    return
  }
  if (snapshot === undefined) {
    // Written once the seed has been read off the JS thread.
    void buddiesEngine
      .loadIdentity()
      .then(writeBuddiesAlertContext)
      .catch((error) => logger.warn('[buddies] alert context', error))
    return
  }
  if (snapshot === written) return
  try {
    BuddiesKeychain.setAlertContext(snapshot)
    written = snapshot
  } catch (error) {
    logger.warn('[buddies] alert context', error)
  }
}

/**
 * Keeps the iOS extension's copy current as buddies, invites, shared Plans,
 * mutes, and the app's language change, a second after the last change and as
 * the app leaves the foreground. It lives in a Keychain item only this app and
 * its extension can read, readable after the first unlock, never synced.
 */
export function useBuddiesAlertContext() {
  useEffect(() => {
    if (Platform.OS !== 'ios' || !BuddiesKeychain.isAlertContextAvailable())
      return
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      if (timer) clearTimeout(timer)
      timer = null
      writeBuddiesAlertContext()
    }
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(flush, WRITE_DEBOUNCE_MS)
    }
    schedule()
    const unsubscribe = [
      useBuddies.subscribe(schedule),
      usePreferences.subscribe(schedule),
      useServiceReport.subscribe(schedule),
      useConversations.subscribe(schedule),
      useContacts.subscribe(schedule),
    ]
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'background') flush()
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe.forEach((stop) => stop())
      appState.remove()
    }
  }, [])
}
