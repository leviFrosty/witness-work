import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { analytics } from '@/lib/analytics'
import { HttpError } from '@/lib/http/request'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { syncNow } from '@/lib/syncClock'
import { toast } from '@/stores/toasts'
import type { WebCloudSyncClient } from '@/app/web-cloud-sync/webCloudSyncClient'
import {
  decideWebCloudSync,
  isWaitingState,
  type WebCloudSyncSession,
  type WebCloudSyncSlot,
  type WebCloudSyncState,
} from '@/app/web-cloud-sync/webCloudSyncGate'

/**
 * While the page waits for a phone, how often it lists the account's slots
 * again. Only while the page is visible; a return to it (focus, the tab shown
 * again) checks at once.
 */
export const WEB_CLOUD_SYNC_CHECK_MS = 15_000

type Options = {
  client: WebCloudSyncClient
  /** This browser's own slot id, which doesn't count as another device. */
  ownSlotId: string | null
  onReady: () => void
}

/** The browser's own focus event; React Native's AppState covers visibility. */
const addWindowFocusListener = (listener: () => void): (() => void) => {
  const target = globalThis as {
    addEventListener?: (type: string, listener: () => void) => void
    removeEventListener?: (type: string, listener: () => void) => void
  }
  if (Platform.OS !== 'web' || !target.addEventListener) return () => {}
  target.addEventListener('focus', listener)
  return () => target.removeEventListener?.('focus', listener)
}

const failureReason = (error: unknown) =>
  error instanceof HttpError ? (error.serverCode ?? error.kind) : 'unknown'

/**
 * What the web's Cloud Sync screen shows (`decideWebCloudSync`), kept current:
 * it reads the account's slots, sessions and request when it opens and on every
 * return to the page, and while it waits for a phone, the slots every
 * `WEB_CLOUD_SYNC_CHECK_MS`. Calls `onReady` once another device's slot is
 * there. Null until the first read.
 */
export function useWebCloudSync({ client, ownSlotId, onReady }: Options) {
  const [state, setState] = useState<WebCloudSyncState | null>(null)
  const [turningOn, setTurningOn] = useState(false)
  const known = useRef<{
    sessions: WebCloudSyncSession[]
    requestedAt: number | null
  } | null>(null)
  /** Asks this page made, so a read that was already out keeps the latest. */
  const asks = useRef(0)

  const decide = (slots: WebCloudSyncSlot[]) => {
    if (!known.current) return
    setState(
      decideWebCloudSync({
        slots,
        ownSlotId,
        sessions: known.current.sessions,
        requestedAt: known.current.requestedAt,
        now: syncNow(),
      })
    )
  }

  // Slots every time; sessions and the request only on a full read, since
  // they change when the User does something elsewhere, not by the second.
  const check = async (full: boolean) => {
    try {
      if (full || !known.current) {
        const asksBefore = asks.current
        const [slots, sessions, requestedAt] = await Promise.all([
          client.listSlots(),
          client.listSessions(),
          client.readRequestedAt(),
        ])
        // The server's answer stands (a lapsed request is null), unless this
        // page asked while the read was out: then the ask is newer.
        const askedMeanwhile = asks.current !== asksBefore
        known.current = {
          sessions,
          requestedAt:
            requestedAt ??
            (askedMeanwhile ? (known.current?.requestedAt ?? null) : null),
        }
        decide(slots)
      } else {
        decide(await client.listSlots())
      }
    } catch (error) {
      // Offline or the server busy: the next check tries again.
      logger.warn('[webCloudSync] check failed', error)
    }
  }

  const onCheck = useEffectEvent((full: boolean) => void check(full))
  useEffect(() => {
    onCheck(true)
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') onCheck(true)
    })
    const removeFocus = addWindowFocusListener(() => onCheck(true))
    return () => {
      appState.remove()
      removeFocus()
    }
  }, [client, ownSlotId])

  const waiting = isWaitingState(state)
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') onCheck(false)
    }, WEB_CLOUD_SYNC_CHECK_MS)
    return () => clearInterval(timer)
  }, [waiting])

  const readyCalled = useRef(false)
  const reached = useEffectEvent((next: WebCloudSyncState) => {
    analytics.capture('cloud_sync_web_gate_state', { state: next })
    if (next === 'ready' && !readyCalled.current) {
      readyCalled.current = true
      onReady()
    }
  })
  useEffect(() => {
    if (state !== null) reached(state)
  }, [state])

  const turnOn = async () => {
    if (turningOn) return
    setTurningOn(true)
    try {
      const requestedAt = await client.requestCloudSync()
      analytics.capture('cloud_sync_web_gate_action', {
        action: 'turn_on',
        outcome: 'requested',
      })
      asks.current += 1
      known.current = {
        sessions: known.current?.sessions ?? [],
        requestedAt,
      }
      await check(false)
    } catch (error) {
      analytics.capture('cloud_sync_web_gate_action', {
        action: 'turn_on',
        outcome: 'failed',
        reason: failureReason(error),
      })
      // Cloud Sync off on the server, or the account not entitled: trying
      // again now won't help, unlike a dropped connection.
      const code = error instanceof HttpError ? error.serverCode : null
      toast.error(
        i18n.t(
          code === 'disabled' || code === 'supporter_required'
            ? 'webCloudSync_turnOnUnavailable'
            : 'webCloudSync_turnOnFailed'
        )
      )
    } finally {
      setTurningOn(false)
    }
  }

  return { state, turnOn, turningOn }
}
