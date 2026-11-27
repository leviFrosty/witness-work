import i18n from '@/lib/locales'
import { joinNames } from '@/features/territories/lib/shareText'
import type { SyncDeviceFiles } from '@/lib/syncDevices'
import type { SealingStatus } from '@/lib/syncTransport/sealed/sealedTransport'
import type { HoldupReason } from '@/lib/syncTransport/sealed/sealingGate'

const names = (
  filenames: string[],
  devices: SyncDeviceFiles | null | undefined
) => {
  const list = filenames.map(
    (filename) =>
      devices?.[filename]?.deviceName || i18n.t('iCloudDeviceUnknown')
  )
  return joinNames([...new Set(list)])
}

const WAITING_KEYS = {
  update: 'platformSealing_waitingUpdate',
  'other-account': 'platformSealing_waitingAccount',
  'no-key': 'platformSealing_waitingKey',
} as const satisfies Record<HoldupReason, string>

export function sealingStatusCopy(
  status: SealingStatus,
  devices: SyncDeviceFiles | null | undefined
): { value: string; footer: string | null } {
  if (status.state === 'sealed')
    return {
      value: i18n.t('platformSealing_on'),
      footer: status.otherAccount
        ? i18n.t('platformSealing_otherAccount')
        : null,
    }
  const value = i18n.t('platformSealing_waiting')
  if (status.waitingFor === 'key')
    return { value, footer: i18n.t('platformSealing_waitingThisDevice') }
  if (status.waitingFor !== 'devices' || !status.holdups.length)
    return { value, footer: i18n.t('platformSealing_waitingSoon') }
  for (const reason of ['other-account', 'update', 'no-key'] as const) {
    const held = status.holdups.filter((holdup) => holdup.reason === reason)
    if (held.length)
      return {
        value,
        footer: i18n.t(WAITING_KEYS[reason], {
          names: names(
            held.map((holdup) => holdup.filename),
            devices
          ),
        }),
      }
  }
  return { value, footer: null }
}
