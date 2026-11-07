import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { analytics } from '@/lib/analytics'
import { addWindowFocusListener } from '@/lib/appLifecycle'
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

export const WEB_CLOUD_SYNC_CHECK_MS = 15_000

type Options = {
  client: WebCloudSyncClient

  ownSlotId: string | null
  onReady: () => void
}

export const gateFailureReason = (error: unknown): string => {
  if (!(error instanceof HttpError)) return 'unknown'
  const code = error.serverCode
  if (code === null || code === undefined) return error.kind
  return /^[a-z][a-z0-9_]{0,31}$/.test(code) ? code : 'other'
}

export function useWebCloudSync({ client, ownSlotId, onReady }: Options) {
  const [state, setState] = useState<WebCloudSyncState | null>(null)
  const [turningOn, setTurningOn] = useState(false)
  const known = useRef<{
    sessions: WebCloudSyncSession[]
    requestedAt: number | null
  } | null>(null)

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

  const check = async (full: boolean) => {
    try {
      if (full || !known.current) {
        const asksBefore = asks.current
        const [slots, sessions, requestedAt] = await Promise.all([
          client.listSlots(),
          client.listSessions(),
          client.readRequestedAt(),
        ])

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
      logger.warn('[webCloudSync] check failed', error)
    }
  }

  const onCheck = useEffectEvent((full: boolean) => void check(full))
  useEffect(() => {
    onCheck(true)
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') onCheck(true)
    })
    const focus = addWindowFocusListener(() => onCheck(true))
    return () => {
      appState.remove()
      focus.remove()
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
        reason: gateFailureReason(error),
      })

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
