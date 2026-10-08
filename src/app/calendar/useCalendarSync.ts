import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { subscribeCalendarChanges } from '../../../modules/calendar-bridge'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import {
  useCalendarPublishing,
  useCalendarSync as useCalendarSettings,
} from '@/stores/calendarSync'
import {
  calendarAction,
  finishDisconnect,
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
    if (!ready || Platform.OS !== 'ios') return
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let running = false
    let pull = false
    let calendarChanged = false
    let retries = 0
    const retryDelays = [5_000, 20_000, 60_000]
    const fingerprint = () =>
      JSON.stringify([
        useConversations
          .getState()
          .conversations.map((visit) => [
            visit.id,
            visit.contact.id,
            visit.followUp?.date,
            visit.followUp?.dismissed,
            visit.followUp?.notifyMe,
            visit.followUp?.reminderOffsetMinutes,
            visit.followUp?.notifications?.[0]?.date,
          ]),
        useConversations.getState().deletedConversations,
        useContacts
          .getState()
          .contacts.map((contact) => [
            contact.id,
            contact.name,
            contact.address,
          ]),
        useContacts.getState().deletedContacts,
        useCalendarSettings.getState().includeDetails,
        useCalendarSettings.getState().enabled,
        // Follow-ups without their own reminder offset use this default.
        usePreferences.getState().returnVisitNotificationOffset,
      ])
    const run = () => {
      if (stopped || running || AppState.currentState !== 'active') return
      const settings = useCalendarSettings.getState()
      const withPull = pull
      pull = false
      // Devices that never published have nothing to maintain. Handoff
      // targets are covered by `sharedCalendar`. A device that declined or
      // disconnected only finishes interrupted work, then stops.
      if (
        !settings.enabled &&
        !settings.registered &&
        (settings.optedOut || !settings.sharedCalendar)
      )
        return
      // Data edits only matter to a device that publishes.
      if (!settings.enabled && !withPull) return
      running = true
      const before = fingerprint()
      let failed = false
      void calendarAction(
        async () => {
          if (settings.enabled) {
            await publishCalendar({ pull: withPull })
            return
          }
          // Refresh also completes a pending transfer after a previous
          // interrupted batch, even when this device has disabled its calendar
          // integration.
          if (settings.optedOut) {
            await finishDisconnect()
            return
          }
          const state = await refreshPublishing()
          const { deviceId } = useCalendarPublishing.getState()
          if (state.primary === deviceId) await reconnectSharedCalendar()
        },
        // Only a device that publishes reports failures.
        { background: true, report: settings.enabled }
      )
        .then(() => {
          retries = 0
        })
        .catch(() => {
          failed = true
        })
        .finally(() => {
          running = false
          // Edits made during a network request must not be dropped. Comparing
          // content avoids a loop when an iCloud merge replaces equal arrays.
          if (stopped) return
          if (fingerprint() !== before || pull || calendarChanged) {
            calendarChanged = false
            schedule({ withPull: failed && withPull })
          } else if (failed && retries < retryDelays.length) {
            pull = withPull
            timer = setTimeout(run, retryDelays[retries++])
          }
        })
    }
    const schedule = ({ withPull = false }: { withPull?: boolean } = {}) => {
      retries = 0
      if (withPull) pull = true
      if (running) return
      clearTimeout(timer)
      timer = setTimeout(run, 1500)
    }
    let lastFingerprint = fingerprint()
    const onDataChange = () => {
      const next = fingerprint()
      if (next === lastFingerprint) return
      lastFingerprint = next
      schedule()
    }
    const subscriptions = [
      useContacts.subscribe(onDataChange),
      useConversations.subscribe(onDataChange),
      usePreferences.subscribe(onDataChange),
      useCalendarSettings.subscribe((state, previous) => {
        if (
          state.enabled !== previous.enabled ||
          state.includeDetails !== previous.includeDetails
        )
          schedule()
      }),
      useCalendarPublishing.subscribe((state, previous) => {
        if (state.state?.primary !== previous.state?.primary)
          schedule({ withPull: true })
      }),
    ]
    const calendarChanges = subscribeCalendarChanges(() => {
      calendarChanged = running
      schedule()
    })
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule({ withPull: true })
    })
    schedule({ withPull: true })
    return () => {
      stopped = true
      clearTimeout(timer)
      subscriptions.forEach((unsubscribe) => unsubscribe())
      foreground.remove()
      calendarChanges?.remove()
    }
  }, [ready])
}
