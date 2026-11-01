import { useEffect } from 'react'
import { addForegroundListener } from '@/lib/appLifecycle'
import { deviceAttestation } from '@/lib/attestation'
import { addReconnectListener } from '@/lib/http/online'
import { onAccountStatus } from '@/lib/serverAccount'
import { onRevenueCatLinked } from '@/lib/serverAccount/revenueCatLinkRuntime'
import { cleanUpNotesImport } from '@/features/scribe/legacy/cleanup'
import { isTurnRunning, setRun } from '@/features/scribe/runtime/runs'
import { scribeRuntime } from '@/features/scribe/runtime/deps'
import { resumeAfterReconnect } from '@/features/scribe/runtime/turnLoop'
import {
  noteSupporterAnswer,
  refreshDeviceGate,
  refreshLimitedUsage,
  refreshStatus,
} from '@/features/scribe/runtime/status'
import { useScribeConversations } from '@/features/scribe/stores/conversations'
import { useScribeStatusStore } from '@/features/scribe/stores/status'
import { useScribeEnabled } from '@/hooks/useScribeEnabled'

const GATE_RECHECK_MS = 60_000

function offerInterruptedTurns(): void {
  for (const conversation of Object.values(
    useScribeConversations.getState().conversations
  ))
    if (conversation.suspended && !isTurnRunning(conversation.id))
      setRun(conversation.id, {
        phase: 'error',
        error: {
          code: 'unknown',
          retryable: true,
          retryAfterMs: null,
          resetsAt: null,
        },
      })
}

export function ScribeRoot(): null {
  const enabled = useScribeEnabled()
  const attestationUnavailable = useScribeStatusStore(
    (state) => state.gate.attestationUnavailable
  )

  useEffect(() => {
    cleanUpNotesImport()
    offerInterruptedTurns()
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refreshStatus({ force: true })

    void deviceAttestation.prepareRecovery().catch(() => undefined)
    const foreground = addForegroundListener(() => {
      void refreshStatus()
      refreshLimitedUsage()
    })
    const reconnect = addReconnectListener(() => {
      void refreshStatus({ force: true })
      void resumeAfterReconnect(scribeRuntime())
    })
    const status = onAccountStatus(() => void refreshDeviceGate())
    const linked = onRevenueCatLinked(({ supporter }) =>
      noteSupporterAnswer(supporter)
    )
    return () => {
      foreground.remove()
      reconnect.remove()
      status()
      linked()
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !attestationUnavailable) return
    const timer = setInterval(() => void refreshDeviceGate(), GATE_RECHECK_MS)
    return () => clearInterval(timer)
  }, [enabled, attestationUnavailable])

  return null
}
