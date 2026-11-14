import { describe, expect, it } from 'vitest'
import {
  deleteKeyRecord,
  getKeyRecord,
  getUuidOwner,
  putKeyRecord,
  putUuidOwner,
  type AppAttestKv,
  type DeviceKeyRecord,
} from './keyStore'
import { makeMemoryKv } from '../test/memoryKv'

const kvOf = () =>
  makeMemoryKv() as unknown as AppAttestKv & { store: Map<string, string> }

const record = (uuid: string): DeviceKeyRecord => ({
  spki: 'c3BraQ',
  signCount: 7,
  uuid,
  environment: 'development',
  attestedAt: 123,
})

describe('legacy App Attest KV adapter', () => {
  it('reads the deployed owner/key shape for lazy migration', async () => {
    const kv = kvOf()
    await putUuidOwner(kv, 'uuid-1', 'key-A')
    await putKeyRecord(kv, 'key-A', record('uuid-1'))

    expect(await getUuidOwner(kv, 'uuid-1')).toBe('key-A')
    expect(await getKeyRecord(kv, 'key-A')).toEqual(record('uuid-1'))
  })

  it('fails closed on malformed legacy key state', async () => {
    const kv = kvOf()
    await kv.put(
      'key:key-A',
      JSON.stringify({ ...record('uuid-1'), signCount: -1 })
    )

    expect(await getKeyRecord(kv, 'key-A')).toBeNull()
  })

  it('can remove a superseded key from the rolling-deployment mirror', async () => {
    const kv = kvOf()
    await putKeyRecord(kv, 'key-A', record('uuid-1'))

    await deleteKeyRecord(kv, 'key-A')

    expect(await getKeyRecord(kv, 'key-A')).toBeNull()
  })
})
