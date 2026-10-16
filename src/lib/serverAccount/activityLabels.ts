import {
  type DeviceLabel,
  openDeviceLabel,
} from '@/lib/serverAccount/deviceLabel'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

/**
 * Opens the sealed device labels the account's sessions and activity carry (ADR
 * 0028) with this device's account key. A label that's missing, or sealed under
 * another account key, reads as null, and the screens show the session's
 * platform instead. Opened once per label.
 */
export type DeviceLabelReader = (sealed: string | null) => DeviceLabel | null

export function createDeviceLabelReader(
  accountKey: Uint8Array
): DeviceLabelReader {
  const { publicKey } = deriveAccountSigningKey(accountKey)
  const opened = new Map<string, DeviceLabel | null>()
  return (sealed) => {
    if (!sealed) return null
    if (!opened.has(sealed)) {
      let label: DeviceLabel | null = null
      try {
        label = openDeviceLabel(accountKey, publicKey, sealed)
      } catch {
        label = null
      }
      opened.set(sealed, label)
    }
    return opened.get(sealed) ?? null
  }
}
