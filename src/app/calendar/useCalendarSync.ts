import { useEffect } from 'react'
import { AppState } from 'react-native'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import {
  useCalendarPublishing,
  useCalendarSync as useCalendarSettings,
} from '@/stores/calendarSync'
import {
  calendarAction,
  publishCalendar,
  reconnectSharedCalendar,
  refreshPublishing,
} from '@/app/calendar/calendarSync'

/**
 * Foreground maintenance only. Pending exports survive because domain state
 * persists. Data edits publish without an iCloud pull; launch and foreground
 * pull first so the snapshot includes other devices' changes.
 */
export function useCalendarSync(ready: boolean | undefined) {
  useEffect(() => {
    if (!ready) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let running = false
    let pull = false
    const fingerprint = () =>
      JSON.stringify([
        useConversations.getState().conversations,
        useConversations.getState().deletedConversations,
        useContacts.getState().contacts,
        useContacts.getState().deletedContacts,
        useCalendarSettings.getState().includeDetails,
        useCalendarSettings.getState().enabled,
      ])
    const run = () => {
      if (stopped || running || AppState.currentState !== 'active') return
      const settings = useCalendarSettings.getState()
      const withPull = pull
      pull = false
      // Devices that never published have nothing to maintain. Handoff
      // targets are covered by `sharedCalendar`.
      if (!settings.enabled && !settings.registered && !settings.sharedCalendar)
        return
      // Data edits only matter to a device that publishes.
      if (!settings.enabled && !withPull) return
      running = true
      const before = fingerprint()
      void calendarAction(
        async () => {
          if (settings.enabled) {
            await publishCalendar({ pull: withPull })
            return
          }
          // Refresh also completes a pending transfer after a previous
          // interrupted batch, even when this device has disabled its calendar
          // integration.
          const state = await refreshPublishing()
          const { deviceId } = useCalendarPublishing.getState()
          if (state.primary === deviceId) await reconnectSharedCalendar()
        },
        { background: true }
      )
        .catch(() => undefined)
        .finally(() => {
          running = false
          // Edits made during a network request must not be dropped. Comparing
          // content avoids a loop when an iCloud merge replaces equal arrays.
          if (!stopped && (fingerprint() !== before || pull)) schedule()
        })
    }
    const schedule = ({ withPull = false }: { withPull?: boolean } = {}) => {
      if (withPull) pull = true
      if (running) return
      clearTimeout(timer)
      timer = setTimeout(run, 1500)
    }
    const onDataChange = () => schedule()
    const subscriptions = [
      useContacts.subscribe(onDataChange),
      useConversations.subscribe(onDataChange),
      useCalendarSettings.subscribe((state, previous) => {
        if (
          state.enabled !== previous.enabled ||
          state.includeDetails !== previous.includeDetails
        )
          schedule()
      }),
    ]
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule({ withPull: true })
    })
    schedule({ withPull: true })
    return () => {
      stopped = true
      clearTimeout(timer)
      subscriptions.forEach((unsubscribe) => unsubscribe())
      foreground.remove()
    }
  }, [ready])
}
