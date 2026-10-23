import { useEffect } from 'react'
import { useOnline, type Online } from '@/lib/http/online'
import { appVersion, useUpdateRequired } from '@/lib/appUpdate'
import { belowMinVersion } from '@/lib/appUpdate/versionGate'
import type { ScribeAvailability } from '@/features/scribe/types'
import {
  SCRIBE_PROTOCOL,
  type ScribeStatusWire,
  type UsageSnapshotWire,
} from '@/features/scribe/lib/wire'
import { refreshDeviceGate } from '@/features/scribe/runtime/status'
import {
  useScribeStatusStore,
  type ScribeDeviceGate,
} from '@/features/scribe/stores/status'
import { useScribeUsageStore } from '@/features/scribe/stores/usage'
import { currentUsageSnapshot } from '@/features/scribe/lib/usageSnapshot'
import { useUsageClock } from '@/features/scribe/hooks/useUsageClock'
import { useScribeEnabled } from '@/hooks/useScribeEnabled'

export interface ScribeAvailabilityInput {
  enabled: boolean
  status: ScribeStatusWire | null
  online: Online
  /** Ww-api answered 426 this launch (any feature). */
  updateRequiredByServer: boolean
  appVersion: string | null
  gate: ScribeDeviceGate
  /** Dev builds: a fake client answers, so device gates don't apply. */
  devClient: boolean
  usage: UsageSnapshotWire | null
}

/**
 * Precedence, first match wins: flag, server switch (protocol → Status),
 * connection, app version, device, account, then the usage windows.
 */
export function scribeAvailability(
  input: ScribeAvailabilityInput
): ScribeAvailability {
  if (!input.enabled) return { status: 'hidden', reason: 'flag_off' }
  if (input.status?.enabled === false)
    return { status: 'hidden', reason: input.status.reason ?? 'disabled' }
  if (input.online === false) return { status: 'offline' }
  if (
    input.updateRequiredByServer ||
    input.gate.updateRequired ||
    (input.status &&
      (belowMinVersion(input.appVersion, input.status.minAppVersion) ||
        input.status.protocol.min > SCRIBE_PROTOCOL))
  )
    return { status: 'blocked', reason: 'update_required' }
  if (!input.devClient) {
    if (input.gate.ineligible)
      return { status: 'blocked', reason: 'device_ineligible' }
    if (input.gate.attestationUnavailable)
      return { status: 'blocked', reason: 'attestation_unavailable' }
    if (input.gate.suspended) return { status: 'blocked', reason: 'suspended' }
  }
  const limited = input.usage?.limited ?? false
  return {
    status: 'available',
    limited,
    resetsAt: limited ? (input.usage?.resetsAt ?? null) : null,
  }
}

/** Whether Scribe AI can be used now. Never opens a session to decide. */
export function useScribeAvailability(): ScribeAvailability {
  const enabled = useScribeEnabled()
  const online = useOnline()
  const status = useScribeStatusStore((state) => state.status)
  const gate = useScribeStatusStore((state) => state.gate)
  const devClient = useScribeStatusStore((state) => state.devClient)
  const usage = useScribeUsageStore((state) => state.snapshot)
  const required = useUpdateRequired((state) => state.required)
  // A saved limit lifts at its reset, even before usage is read again.
  const now = useUsageClock(usage)

  // What the session client learned since the last check (a failed open ends
  // its wait, a suspension was lifted).
  useEffect(() => {
    if (enabled) void refreshDeviceGate()
  }, [enabled])

  return scribeAvailability({
    enabled,
    status,
    online,
    updateRequiredByServer: required?.source === 'server',
    appVersion: appVersion(),
    gate,
    devClient,
    usage: usage ? currentUsageSnapshot(usage, now) : null,
  })
}
