import { fromUtf8, utf8 } from '@/lib/bytes'
import { open, seal } from '@/lib/sealedBlob'
import { deriveDeviceLabelKey } from '@/lib/serverAccount/deviceLabel'
import {
  historyLabelKeys,
  type KeyHistory,
} from '@/lib/serverAccount/keyHistory'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

export const PASSKEY_NAME_MAX = 64

const CONTEXT = 'ww-account/v1/passkey-name'

const aad = (accountPub: string, credentialId: string) =>
  `${CONTEXT}\n${accountPub}\n${credentialId}`

export function normalizePasskeyName(name: string): string {
  return Array.from(name.trim().replace(/\s+/g, ' '))
    .slice(0, PASSKEY_NAME_MAX)
    .join('')
}

export function sealPasskeyName(
  accountKey: Uint8Array,
  credentialId: string,
  name: string,
  nonce: Uint8Array
): string {
  return seal(
    deriveDeviceLabelKey(accountKey),
    utf8(normalizePasskeyName(name)),
    aad(deriveAccountSigningKey(accountKey).publicKey, credentialId),
    nonce
  )
}

export type PasskeyNameReader = (
  credentialId: string,
  sealed: string | undefined
) => string | null

export function createPasskeyNameReader(
  accountKey: Uint8Array,
  history: KeyHistory | null = null
): PasskeyNameReader {
  const keys = [
    {
      accountPub: deriveAccountSigningKey(accountKey).publicKey,
      key: deriveDeviceLabelKey(accountKey),
    },
    ...historyLabelKeys(history),
  ]
  return (credentialId, sealed) => {
    if (!sealed) return null
    for (const { accountPub, key } of keys) {
      try {
        const name = normalizePasskeyName(
          fromUtf8(open(key, sealed, aad(accountPub, credentialId)))
        )
        return name || null
      } catch {}
    }
    return null
  }
}
