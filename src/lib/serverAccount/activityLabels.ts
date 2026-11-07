import {
  type DeviceLabel,
  deriveDeviceLabelKey,
  openDeviceLabelWith,
} from '@/lib/serverAccount/deviceLabel'
import {
  historyLabelKeys,
  type KeyHistory,
} from '@/lib/serverAccount/keyHistory'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

export type DeviceLabelReader = (sealed: string | null) => DeviceLabel | null

export function createDeviceLabelReader(
  accountKey: Uint8Array,
  history: KeyHistory | null = null
): DeviceLabelReader {
  const keys = [
    {
      accountPub: deriveAccountSigningKey(accountKey).publicKey,
      key: deriveDeviceLabelKey(accountKey),
    },
    ...historyLabelKeys(history),
  ]
  const opened = new Map<string, DeviceLabel | null>()
  const read = (sealed: string): DeviceLabel | null => {
    for (const { accountPub, key } of keys) {
      try {
        return openDeviceLabelWith(key, accountPub, sealed)
      } catch {}
    }
    return null
  }
  return (sealed) => {
    if (!sealed) return null
    if (!opened.has(sealed)) opened.set(sealed, read(sealed))
    return opened.get(sealed) ?? null
  }
}
