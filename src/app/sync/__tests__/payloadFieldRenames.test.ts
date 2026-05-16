import { describe, expect, it } from 'vitest'
import { normalizeLegacyPayloadFieldNames } from '@/app/sync/payloadFieldRenames'

const makePayload = (
  values: Record<string, unknown>,
  updatedAt: Record<string, number>
) => ({
  version: 1,
  preferencesStore: { values, updatedAt },
})

describe('normalizeLegacyPayloadFieldNames', () => {
  it('renames excludedWeekdays → offDays and meetingWeekdays → meetingDays', () => {
    const d = makePayload(
      { excludedWeekdays: [0, 6], meetingWeekdays: [3] },
      { excludedWeekdays: 1700000001000, meetingWeekdays: 1700000002000 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.offDays).toEqual([0, 6])
    expect(d.preferencesStore.values.meetingDays).toEqual([3])
    expect(d.preferencesStore.values).not.toHaveProperty('excludedWeekdays')
    expect(d.preferencesStore.values).not.toHaveProperty('meetingWeekdays')
    expect(d.preferencesStore.updatedAt.offDays).toBe(1700000001000)
    expect(d.preferencesStore.updatedAt.meetingDays).toBe(1700000002000)
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('excludedWeekdays')
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('meetingWeekdays')
  })

  it('leaves a payload without the legacy keys untouched', () => {
    const d = makePayload(
      { offDays: [1], meetingDays: [2] },
      { offDays: 1700000005000, meetingDays: 1700000006000 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.offDays).toEqual([1])
    expect(d.preferencesStore.values.meetingDays).toEqual([2])
    expect(d.preferencesStore.updatedAt.offDays).toBe(1700000005000)
    expect(d.preferencesStore.updatedAt.meetingDays).toBe(1700000006000)
  })

  it('prefers the new key when a payload somehow carries both', () => {
    const d = makePayload(
      { excludedWeekdays: [9], offDays: [4, 5] },
      { excludedWeekdays: 1, offDays: 2 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.offDays).toEqual([4, 5])
    expect(d.preferencesStore.values).not.toHaveProperty('excludedWeekdays')
    expect(d.preferencesStore.updatedAt.offDays).toBe(2)
  })

  it('is idempotent', () => {
    const d = makePayload(
      { excludedWeekdays: [0], meetingWeekdays: [3] },
      { excludedWeekdays: 1, meetingWeekdays: 2 }
    )
    normalizeLegacyPayloadFieldNames(d)
    const snapshot = JSON.stringify(d)
    normalizeLegacyPayloadFieldNames(d)
    expect(JSON.stringify(d)).toBe(snapshot)
  })

  it('no-ops when preferencesStore is missing or malformed', () => {
    const d1 = {} as Record<string, unknown>
    const d2 = { preferencesStore: null } as Record<string, unknown>
    const d3 = {
      preferencesStore: { values: null, updatedAt: null },
    } as Record<string, unknown>
    expect(() => normalizeLegacyPayloadFieldNames(d1)).not.toThrow()
    expect(() => normalizeLegacyPayloadFieldNames(d2)).not.toThrow()
    expect(() => normalizeLegacyPayloadFieldNames(d3)).not.toThrow()
  })

  it('renames publisher → role on values and updatedAt (legacy peer payload)', () => {
    const d = makePayload(
      { publisher: 'regularPioneer' },
      { publisher: 1700000010000 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.role).toBe('regularPioneer')
    expect(d.preferencesStore.values).not.toHaveProperty('publisher')
    expect(d.preferencesStore.updatedAt.role).toBe(1700000010000)
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('publisher')
  })

  it('preserves the canonical leaf value `publisher` when carried under the legacy publisher field', () => {
    // The field name renames, but the *value* `'publisher'` (= Regular
    // Publisher role) stays as-is.
    const d = makePayload({ publisher: 'publisher' }, {})

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.role).toBe('publisher')
    expect(d.preferencesStore.values).not.toHaveProperty('publisher')
  })

  it('prefers role when a payload carries both publisher and role', () => {
    const d = makePayload(
      { publisher: 'publisher', role: 'specialPioneer' },
      { publisher: 1, role: 2 }
    )

    normalizeLegacyPayloadFieldNames(d)

    expect(d.preferencesStore.values.role).toBe('specialPioneer')
    expect(d.preferencesStore.values).not.toHaveProperty('publisher')
    expect(d.preferencesStore.updatedAt.role).toBe(2)
    expect(d.preferencesStore.updatedAt).not.toHaveProperty('publisher')
  })
})
