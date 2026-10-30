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

/**
 * Opens the sealed device labels the account's sessions and activity carry (ADR
 * 0028) with this device's account key, then with the key history's older label
 * keys, for labels sealed before the account key changed. A label that's
 * missing, or sealed under another account's key, reads as null, and the
 * screens show the session's platform instead. Opened once per label.
 */
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
      } catch {
        // Another key's, or not a label.
      }
    }
    return null
  }
  return (sealed) => {
    if (!sealed) return null
    if (!opened.has(sealed)) opened.set(sealed, read(sealed))
    return opened.get(sealed) ?? null
  }
}
