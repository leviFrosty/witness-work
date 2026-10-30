import { describe, expect, it } from 'vitest'
import { toB64u } from '@/lib/bytes'
import {
  isCommitted,
  type KeyChangeRecord,
  KeyChangeStage,
  memoryKeyChangeRecordStore,
  parseKeyChangeRecord,
} from '@/lib/accountKey/keyChangeRecord'

const record: KeyChangeRecord = {
  v: 1,
  accountId: 'A'.repeat(22),
  oldKey: toB64u(new Uint8Array(32).fill(1)),
  newKey: toB64u(new Uint8Array(32).fill(2)),
  oldKeyEpoch: 0,
  stage: 'confirmed',
  startedAt: 5,
}

describe('key change record', () => {
  it('reads back what it wrote', async () => {
    const store = memoryKeyChangeRecordStore()
    expect(await store.read()).toBeNull()
    await store.write(record)
    expect(await store.read()).toEqual(record)
    await store.write({
      ...record,
      stage: 'stored',
      reseal: { syncSlots: ['s'], photos: [], backupSlots: [] },
    })
    expect((await store.read())?.reseal?.syncSlots).toEqual(['s'])
    await store.remove()
    expect(await store.read()).toBeNull()
  })

  it('refuses a record it can’t trust', () => {
    expect(parseKeyChangeRecord(JSON.stringify(record))).toEqual(record)
    for (const broken of [
      'nope',
      JSON.stringify({ ...record, v: 2 }),
      JSON.stringify({ ...record, stage: 'later' }),
      JSON.stringify({ ...record, newKey: 'short' }),
      JSON.stringify({ ...record, newKey: record.oldKey }),
      JSON.stringify({ ...record, oldKeyEpoch: -1 }),
    ])
      expect(parseKeyChangeRecord(broken)).toBeNull()
  })

  it('knows which stages come after the server committed', () => {
    expect(KeyChangeStage).toEqual([
      'pending',
      'confirmed',
      'committed',
      'stored',
      'resealed',
      'buddies-reset',
    ])
    expect(isCommitted({ ...record, stage: 'confirmed' })).toBe(false)
    expect(isCommitted({ ...record, stage: 'committed' })).toBe(true)
    expect(isCommitted({ ...record, stage: 'buddies-reset' })).toBe(true)
  })
})
