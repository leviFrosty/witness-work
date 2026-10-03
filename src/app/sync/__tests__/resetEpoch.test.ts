import { describe, expect, it } from 'vitest'
import {
  atNewestResetEpoch,
  compareResetEpochs,
  createResetEpoch,
  newestResetEpoch,
} from '@/lib/syncResetEpoch'
import { syncableValues } from '@/lib/syncPreferencePolicy'
import { payloadSchema } from '@/app/sync/payloadValidation'
import { alignPayloadClock } from '@/app/sync/clockSkew'

const e = (id: string, at: number) => ({ id, at, deviceId: 'd' })

describe('reset generations', () => {
  it('order by time, then id, with generation zero lowest', () => {
    expect(compareResetEpochs(null, undefined)).toBe(0)
    expect(compareResetEpochs(null, e('a', 1))).toBeLessThan(0)
    expect(compareResetEpochs(e('a', 1), null)).toBeGreaterThan(0)
    expect(compareResetEpochs(e('z', 1), e('a', 2))).toBeLessThan(0)
    expect(compareResetEpochs(e('b', 2), e('a', 2))).toBeGreaterThan(0)
    expect(compareResetEpochs(e('a', 2), { ...e('a', 2) })).toBe(0)
    expect(newestResetEpoch([null, e('a', 1), e('b', 1), undefined])).toEqual(
      e('b', 1)
    )
    expect(newestResetEpoch([null, undefined])).toBeNull()
  })

  it('keep only payloads of the newest generation', () => {
    const payloads: { name: string; resetEpoch?: ReturnType<typeof e> }[] = [
      { name: 'zero' },
      { name: 'old', resetEpoch: e('a', 1) },
      { name: 'new', resetEpoch: e('b', 2) },
      { name: 'new-copy', resetEpoch: e('b', 2) },
    ]
    expect(atNewestResetEpoch(payloads).map((p) => p.name)).toEqual([
      'new',
      'new-copy',
    ])
    expect(atNewestResetEpoch(payloads.slice(0, 1))).toEqual([{ name: 'zero' }])
  })

  it('a new one is later than the previous even if the clock went back', () => {
    expect(
      createResetEpoch({ now: 50, previous: e('a', 100), deviceId: 'd' }).at
    ).toBe(101)
    expect(
      createResetEpoch({ now: 500, previous: null, deviceId: 'd' })
    ).toEqual(expect.objectContaining({ at: 500, deviceId: 'd' }))
  })

  it('stay device-local in every shared preference path', () => {
    expect(
      syncableValues({
        iCloudResetEpoch: e('a', 1),
        iCloudResetAdoptedNotice: {},
      })
    ).toEqual({})
  })
})

describe('the payload field', () => {
  const base = {
    version: 1,
    writtenAt: 1_000_000,
    deviceId: 'd',
    contactStore: { contacts: [], deletedContacts: [] },
    conversationStore: { conversations: [] },
    serviceReportStore: {
      serviceReports: {},
      dayPlans: [],
      recurringPlans: [],
    },
    preferencesStore: { values: {} },
  }

  it('is optional and validated', () => {
    expect(payloadSchema.safeParse(base).success).toBe(true)
    const withEpoch = payloadSchema.safeParse({
      ...base,
      resetEpoch: { ...e('a', 5), deviceName: 'iPad' },
    })
    expect(withEpoch.success && withEpoch.data.resetEpoch).toEqual({
      ...e('a', 5),
      deviceName: 'iPad',
    })
    expect(
      payloadSchema.safeParse({ ...base, resetEpoch: { id: 'a' } }).success
    ).toBe(false)
  })

  it('is never shifted by clock alignment, so every device compares the same value', () => {
    const at = 1_000_000
    const aligned = alignPayloadClock(
      { ...base, resetEpoch: e('a', at) },
      at + 60 * 60_000
    )
    expect(aligned.writtenAt).not.toBe(base.writtenAt)
    expect(aligned.resetEpoch.at).toBe(at)
  })
})
