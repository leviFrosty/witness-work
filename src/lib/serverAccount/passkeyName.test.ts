import { describe, expect, it } from 'vitest'
import { toB64u } from '@/lib/bytes'
import { createDeviceLabelReader } from '@/lib/serverAccount/activityLabels'
import { deriveDeviceLabelKey } from '@/lib/serverAccount/deviceLabel'
import type { KeyHistory } from '@/lib/serverAccount/keyHistory'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  createPasskeyNameReader,
  normalizePasskeyName,
  PASSKEY_NAME_MAX,
  sealPasskeyName,
} from '@/lib/serverAccount/passkeyName'

const ACCOUNT_KEY = Uint8Array.from({ length: 32 }, (_, i) => i)
const OLD_KEY = new Uint8Array(32).fill(7)
const NONCE = Uint8Array.from({ length: 12 }, (_, i) => 0xa0 + i)
const CREDENTIAL = 'Y3JlZGVudGlhbC1vbmU'

describe('passkey names', () => {
  it('opens a name under the same key and credential only', () => {
    const sealed = sealPasskeyName(ACCOUNT_KEY, CREDENTIAL, 'Work iPad', NONCE)
    expect(createPasskeyNameReader(ACCOUNT_KEY)(CREDENTIAL, sealed)).toBe(
      'Work iPad'
    )
    expect(createPasskeyNameReader(ACCOUNT_KEY)('b3RoZXI', sealed)).toBeNull()
    expect(createPasskeyNameReader(OLD_KEY)(CREDENTIAL, sealed)).toBeNull()
    expect(createPasskeyNameReader(ACCOUNT_KEY)(CREDENTIAL, undefined)).toBe(
      null
    )
    expect(createPasskeyNameReader(ACCOUNT_KEY)(CREDENTIAL, 'AAAA')).toBeNull()
  })

  it('never opens as a device label', () => {
    const sealed = sealPasskeyName(ACCOUNT_KEY, CREDENTIAL, 'Work iPad', NONCE)
    expect(createDeviceLabelReader(ACCOUNT_KEY)(sealed)).toBeNull()
  })

  it('opens a name sealed under an older key through the key history', () => {
    const sealed = sealPasskeyName(OLD_KEY, CREDENTIAL, 'Old phone', NONCE)
    const history = {
      entries: [
        {
          accountPub: deriveAccountSigningKey(OLD_KEY).publicKey,
          device: toB64u(deriveDeviceLabelKey(OLD_KEY)),
        },
      ],
    } as unknown as KeyHistory
    const read = createPasskeyNameReader(ACCOUNT_KEY, history)
    expect(read(CREDENTIAL, sealed)).toBe('Old phone')
  })

  it('trims, collapses spaces, and cuts to the limit', () => {
    expect(normalizePasskeyName('  My   iPhone \n')).toBe('My iPhone')
    expect(normalizePasskeyName('🔑'.repeat(80))).toBe(
      '🔑'.repeat(PASSKEY_NAME_MAX)
    )
    expect(
      sealPasskeyName(ACCOUNT_KEY, CREDENTIAL, '🔑'.repeat(80), NONCE).length
    ).toBeLessThanOrEqual(512)
  })
})
