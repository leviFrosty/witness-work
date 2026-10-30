import { describe, expect, it } from 'vitest'
import { createDeviceLabelReader } from '@/lib/serverAccount/activityLabels'
import { sealDeviceLabel } from '@/lib/serverAccount/deviceLabel'
import {
  appendKeyHistory,
  keyHistoryEntry,
} from '@/lib/serverAccount/keyHistory'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'

const K1 = new Uint8Array(32).fill(1)
const K2 = new Uint8Array(32).fill(2)
const label = { name: 'Old iPad', platform: 'ios' as const, model: 'iPad' }
const sealedUnder = (key: Uint8Array) =>
  sealDeviceLabel(
    key,
    deriveAccountSigningKey(key).publicKey,
    label,
    new Uint8Array(12).fill(3)
  )

describe('device label reader', () => {
  it('reads labels sealed under the current key', () => {
    expect(createDeviceLabelReader(K2)(sealedUnder(K2))).toEqual(label)
    expect(createDeviceLabelReader(K2)(null)).toBeNull()
  })

  it('reads a label an older key sealed through the key history', () => {
    const sealed = sealedUnder(K1)
    expect(createDeviceLabelReader(K2)(sealed)).toBeNull()
    const history = appendKeyHistory(null, keyHistoryEntry(K1, 0, 1))
    expect(createDeviceLabelReader(K2, history)(sealed)).toEqual(label)
  })
})
