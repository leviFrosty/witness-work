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

const WRITE_DEBOUNCE_MS = 1000

export function buddiesAlertSnapshot(): string | null | undefined {
  const { registeredInboxId, notificationsEnabled } = useBuddies.getState()
  if (registeredInboxId === null || !notificationsEnabled) return null
  const context = buddiesEngine.alertContext()

  if (context === undefined) return undefined
  if (!context) return null
  return JSON.stringify({
    ...context,
    relay: apis.buddies,
    display: { language: _i18n.locale, ...activeDateConventions() },
  })
}

let written: string | null | undefined

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
