import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { fromUtf8, utf8 } from '@/lib/bytes'
import { open, seal } from '@/lib/sealedBlob'

/**
 * The label `session/open` carries for the device holding the session
 * (docs/accounts-protocol.md, "session/open"): sealed under a key only the
 * User's devices derive, so the server stores it without reading it, and the
 * User's own devices can show which devices hold sessions.
 */

export type DeviceLabel = {
  name: string
  platform: 'ios' | 'android' | 'web'
  model: string
}

/** Longest `name` and `model`, in characters. */
export const DEVICE_LABEL_FIELD_MAX = 64
/** Longest sealed label the server accepts (`too_large` past it). */
export const DEVICE_LABEL_SEALED_MAX = 512

const LABEL = 'ww-account/v1/device'

export function deriveDeviceLabelKey(accountKey: Uint8Array): Uint8Array {
  if (accountKey.length !== 32) throw new Error('Account key must be 32 bytes')
  return hkdf(sha256, accountKey, new Uint8Array(0), utf8(LABEL), 32)
}

const aad = (accountPub: string) => `${LABEL}\n${accountPub}`

/** `0x01 ‖ nonce[12] ‖ ciphertext ‖ tag[16]`, as unpadded base64url. */
const sealedLength = (plaintextBytes: number) =>
  Math.ceil(((1 + 12 + plaintextBytes + 16) * 4) / 3)

const clamp = (value: string) =>
  Array.from(value).slice(0, DEVICE_LABEL_FIELD_MAX).join('')

const plaintext = (label: DeviceLabel) => utf8(JSON.stringify(label))

/**
 * Trimmed and cut to 64 code points each, then shortened (the longer field
 * first) until the sealed label fits in 512 characters, which long non-Latin
 * names can pass.
 */
export function normalizeDeviceLabel(label: DeviceLabel): DeviceLabel {
  const name = Array.from(label.name.trim()).slice(0, DEVICE_LABEL_FIELD_MAX)
  const model = Array.from(label.model.trim()).slice(0, DEVICE_LABEL_FIELD_MAX)
  const build = () => ({
    name: name.join(''),
    platform: label.platform,
    model: model.join(''),
  })
  while (
    sealedLength(plaintext(build()).length) > DEVICE_LABEL_SEALED_MAX &&
    (name.length > 0 || model.length > 0)
  ) {
    if (model.length >= name.length) model.pop()
    else name.pop()
  }
  return build()
}

/** The sealed label (b64u), at most 512 characters. */
export function sealDeviceLabel(
  accountKey: Uint8Array,
  accountPub: string,
  label: DeviceLabel,
  nonce: Uint8Array
): string {
  const sealed = seal(
    deriveDeviceLabelKey(accountKey),
    plaintext(normalizeDeviceLabel(label)),
    aad(accountPub),
    nonce
  )
  if (sealed.length > DEVICE_LABEL_SEALED_MAX)
    throw new Error('Device label too large')
  return sealed
}

/**
 * Throws when it doesn't open under this account or isn't a label. The names
 * come back cut to 64 characters, whatever another client sealed.
 */
export function openDeviceLabel(
  accountKey: Uint8Array,
  accountPub: string,
  sealed: string
): DeviceLabel {
  const value = JSON.parse(
    fromUtf8(open(deriveDeviceLabelKey(accountKey), sealed, aad(accountPub)))
  ) as Partial<DeviceLabel> | null
  if (
    typeof value?.name !== 'string' ||
    typeof value.model !== 'string' ||
    (value.platform !== 'ios' &&
      value.platform !== 'android' &&
      value.platform !== 'web')
  )
    throw new Error('Not a device label')
  return {
    name: clamp(value.name),
    platform: value.platform,
    model: clamp(value.model),
  }
}
