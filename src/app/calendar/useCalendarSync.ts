import { perf } from '@/lib/perf'
import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import {
  calendarSyncSupported,
  subscribeCalendarChanges,
} from '../../../modules/calendar-bridge'
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
  noteCalendarChanged,
  publishCalendar,
  reconnectSharedCalendar,
  refreshPublishing,
} from '@/app/calendar/calendarSync'
import { addForegroundListener } from '@/lib/appLifecycle'

export function useCalendarSync(ready: boolean | undefined) {
  useEffect(() => {
    if (!ready || !calendarSyncSupported) return
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

        usePreferences.getState().returnVisitNotificationOffset,
      ])
    const run = () => {
      if (stopped || running || AppState.currentState !== 'active') return
      perf.count('calendar:run')
      const settings = useCalendarSettings.getState()
      const withPull = pull
      pull = false

      if (
        !settings.enabled &&
        !settings.registered &&
        (settings.optedOut || !settings.sharedCalendar)
      )
        return

      if (!settings.enabled && (!withPull || Platform.OS === 'android')) return
      running = true

      const before = settings.enabled ? fingerprint() : undefined
      let failed = false
      void calendarAction(
        async () => {
          if (settings.enabled) {
            await publishCalendar({ pull: withPull })
            return
          }

          if (settings.optedOut) {
            await finishDisconnect()
            return
          }
          const state = await refreshPublishing()
          const { deviceId } = useCalendarPublishing.getState()
          if (state.primary === deviceId) await reconnectSharedCalendar()
        },

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

          if (stopped) return
          if (
            (before !== undefined && fingerprint() !== before) ||
            pull ||
            calendarChanged
          ) {
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

    let unwatchData: (() => void) | undefined
    const watchData = () => {
      if (!useCalendarSettings.getState().enabled) {
        unwatchData?.()
        unwatchData = undefined
        return
      }
      if (unwatchData) return
      let lastFingerprint = fingerprint()
      const onDataChange = () => {
        const next = fingerprint()
        if (next === lastFingerprint) return
        lastFingerprint = next
        schedule()
      }
      const unsubscribes = [
        useContacts.subscribe((state, previous) => {
          if (
            state.contacts !== previous.contacts ||
            state.deletedContacts !== previous.deletedContacts
          )
            onDataChange()
        }),
        useConversations.subscribe((state, previous) => {
          if (
            state.conversations !== previous.conversations ||
            state.deletedConversations !== previous.deletedConversations
          )
            onDataChange()
        }),
        usePreferences.subscribe((state, previous) => {
          if (
            state.returnVisitNotificationOffset !==
            previous.returnVisitNotificationOffset
          )
            onDataChange()
        }),
      ]
      unwatchData = () => unsubscribes.forEach((unsubscribe) => unsubscribe())
    }
    watchData()
    const subscriptions = [
      useCalendarSettings.subscribe((state, previous) => {
        if (state.enabled !== previous.enabled) watchData()
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
      noteCalendarChanged()
      calendarChanged = running
      schedule()
    })
    const foreground = addForegroundListener(() => schedule({ withPull: true }))
    schedule({ withPull: true })
    return () => {
      stopped = true
      clearTimeout(timer)
      unwatchData?.()
      subscriptions.forEach((unsubscribe) => unsubscribe())
      foreground.remove()
      calendarChanges?.remove()
    }
  }, [ready])
}
