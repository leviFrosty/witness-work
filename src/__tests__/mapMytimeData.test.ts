import { describe, it, expect } from 'vitest'
import { mapMytimeData } from '@/features/mytime-import/lib/mapMytimeData'
import type {
  MytimeAdditionalInfoRow,
  MytimeAdditionalInfoTypeRow,
  MytimeCallRow,
  MytimeRawTables,
  MytimeReturnVisitRow,
  MytimeStatisticsAdjustmentRow,
  MytimeTimeEntryRow,
  MytimeTimeTypeRow,
  MytimeUserRow,
} from '@/features/mytime-import/lib/mytimeSchema'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'

const emptyTables = (): MytimeRawTables => ({
  calls: [],
  returnVisits: [],
  additionalInfo: [],
  additionalInfoTypes: [],
  timeEntries: [],
  timeTypes: [],
  statisticsAdjustments: [],
  users: [],
})

const call = (
  over: Partial<MytimeCallRow> & { Z_PK: number }
): MytimeCallRow => ({
  ZDELETEDCALL: 0,
  ZNAME: null,
  ZHOUSENUMBER: null,
  ZSTREET: null,
  ZAPARTMENTNUMBER: null,
  ZCITY: null,
  ZSTATE: null,
  ZLATTITUDE: null,
  ZLONGITUDE: null,
  ZMOSTRECENTRETURNVISITDATE: null,
  ...over,
})

const rv = (
  over: Partial<MytimeReturnVisitRow> & { Z_PK: number }
): MytimeReturnVisitRow => ({
  ZCALL: null,
  ZDATE: 0,
  ZNOTES: null,
  ZTYPE: 'Return Visit',
  ...over,
})

const infoType = (
  Z_PK: number,
  ZNAME: string
): MytimeAdditionalInfoTypeRow => ({
  Z_PK,
  ZNAME,
})

const info = (
  over: Partial<MytimeAdditionalInfoRow> & { Z_PK: number }
): MytimeAdditionalInfoRow => ({
  ZCALL: null,
  ZTYPE: null,
  ZVALUE: null,
  ZDATE: null,
  ...over,
})

// The four built-in additional-information types every backup ships with.
const BUILTIN_INFO_TYPES: MytimeAdditionalInfoTypeRow[] = [
  infoType(1, 'Email'),
  infoType(2, 'Notes'),
  infoType(3, 'Mobile Phone'),
  infoType(4, 'Phone'),
]

const timeType = (
  over: Partial<MytimeTimeTypeRow> & { Z_PK: number; ZNAME: string }
): MytimeTimeTypeRow => ({ ZDIRECTCREDIT: null, ...over })

// The two built-in time types in a real backup.
const HOURS_TYPE = timeType({ Z_PK: 1, ZNAME: 'Hours' })
const LDC_TYPE = timeType({ Z_PK: 2, ZNAME: 'LDC' })

const timeEntry = (
  over: Partial<MytimeTimeEntryRow> & { Z_PK: number }
): MytimeTimeEntryRow => ({
  ZMINUTES: 0,
  ZTYPE: 1,
  ZDATE: 0,
  ZNOTES: null,
  ...over,
})

const adjustment = (
  over: Partial<MytimeStatisticsAdjustmentRow> & { Z_PK: number }
): MytimeStatisticsAdjustmentRow => ({
  ZTYPE: 'Hours',
  ZTIMESTAMP: null,
  ZADJUSTMENT: 0,
  ...over,
})

const user = (
  over: Partial<MytimeUserRow> & { Z_PK: number }
): MytimeUserRow => ({
  ZPUBLISHERTYPE: null,
  ZPIONEERSTARTDATE: null,
  ZNAME: null,
  ...over,
})

const IMPORTED_AT = new Date('2026-06-08T12:00:00.000Z')

const map = (tables: Partial<MytimeRawTables>) =>
  mapMytimeData({ ...emptyTables(), ...tables }, IMPORTED_AT)

describe('mapMytimeData — contacts', () => {
  it('maps a non-deleted ZCALL to a Contact with a deterministic id', () => {
    const result = map({ calls: [call({ Z_PK: 42, ZNAME: 'Jane Doe' })] })

    expect(result.contacts).toHaveLength(1)
    expect(result.contacts[0]).toMatchObject({
      id: 'mytime-call-42',
      name: 'Jane Doe',
    })
    // MyTime carries no gender, so the field is left unset, not 'unknown'.
    expect(result.contacts[0].gender).toBeUndefined()
  })

  it('builds the address: house+street on line1, apartment on line2', () => {
    const result = map({
      calls: [
        call({
          Z_PK: 1,
          ZHOUSENUMBER: '123',
          ZSTREET: 'Main St',
          ZAPARTMENTNUMBER: 'Apt 4',
          ZCITY: 'Springfield',
          ZSTATE: 'IL',
        }),
      ],
    })

    expect(result.contacts[0].address).toEqual({
      line1: '123 Main St',
      line2: 'Apt 4',
      city: 'Springfield',
      state: 'IL',
    })
  })

  it('omits empty address pieces rather than emitting blank strings', () => {
    const result = map({
      calls: [call({ Z_PK: 1, ZSTREET: 'Main St' })],
    })

    expect(result.contacts[0].address).toEqual({ line1: 'Main St' })
  })

  it('leaves address undefined when the call has no address fields', () => {
    const result = map({ calls: [call({ Z_PK: 1, ZNAME: 'No Address' })] })
    expect(result.contacts[0].address).toBeUndefined()
  })

  it('sets a coordinate only when latitude/longitude are real values', () => {
    const result = map({
      calls: [call({ Z_PK: 1, ZLATTITUDE: 39.78, ZLONGITUDE: -89.65 })],
    })
    expect(result.contacts[0].coordinate).toEqual({
      latitude: 39.78,
      longitude: -89.65,
    })
  })

  it('omits the coordinate when lat/long are 0/0 (MyTime "no location")', () => {
    const result = map({
      calls: [call({ Z_PK: 1, ZLATTITUDE: 0, ZLONGITUDE: 0 })],
    })
    expect(result.contacts[0].coordinate).toBeUndefined()
  })

  it('omits the coordinate when lat/long are null', () => {
    const result = map({ calls: [call({ Z_PK: 1 })] })
    expect(result.contacts[0].coordinate).toBeUndefined()
  })

  it('skips soft-deleted calls (ZDELETEDCALL = 1)', () => {
    const result = map({
      calls: [
        call({ Z_PK: 1, ZNAME: 'Keep' }),
        call({ Z_PK: 2, ZNAME: 'Deleted', ZDELETEDCALL: 1 }),
      ],
    })
    expect(result.contacts.map((c) => c.name)).toEqual(['Keep'])
  })
})

describe('mapMytimeData — visits', () => {
  it('maps a ZRETURNVISIT to a Visit linked to its contact', () => {
    const result = map({
      calls: [call({ Z_PK: 7, ZNAME: 'Jane' })],
      returnVisits: [rv({ Z_PK: 3, ZCALL: 7, ZDATE: 0, ZNOTES: 'Good chat' })],
    })

    expect(result.visits).toHaveLength(1)
    expect(result.visits[0]).toMatchObject({
      id: 'mytime-rv-3',
      contact: { id: 'mytime-call-7' },
      note: 'Good chat',
      isBibleStudy: false,
    })
    expect(result.visits[0].date.toISOString()).toBe('2001-01-01T00:00:00.000Z')
    expect(result.visits[0].notAtHome).toBeFalsy()
  })

  const visitOfType = (type: string) =>
    map({
      calls: [call({ Z_PK: 1 })],
      returnVisits: [rv({ Z_PK: 1, ZCALL: 1, ZTYPE: type })],
    }).visits[0]

  it("flags a 'Study' visit as a bible study", () => {
    const v = visitOfType('Study')
    expect(v.isBibleStudy).toBe(true)
    expect(v.notAtHome).toBeFalsy()
  })

  it("flags a 'Not At Home' visit as not-at-home, not a study", () => {
    const v = visitOfType('Not At Home')
    expect(v.notAtHome).toBe(true)
    expect(v.isBibleStudy).toBe(false)
  })

  it("treats 'Initial Visit' and 'Return Visit' as plain visits", () => {
    expect(visitOfType('Initial Visit')).toMatchObject({
      isBibleStudy: false,
    })
    expect(visitOfType('Initial Visit').notAtHome).toBeFalsy()
    expect(visitOfType('Return Visit').isBibleStudy).toBe(false)
  })

  it("strips the 'Transfered ' prefix before classifying", () => {
    expect(visitOfType('Transfered Study').isBibleStudy).toBe(true)
    expect(visitOfType('Transfered Not At Home').notAtHome).toBe(true)
    expect(visitOfType('Transfered Return Visit').isBibleStudy).toBe(false)
  })

  it('drops visits whose call is missing, null, or soft-deleted', () => {
    const result = map({
      calls: [
        call({ Z_PK: 1, ZNAME: 'Live' }),
        call({ Z_PK: 2, ZNAME: 'Deleted', ZDELETEDCALL: 1 }),
      ],
      returnVisits: [
        rv({ Z_PK: 1, ZCALL: 1 }), // kept
        rv({ Z_PK: 2, ZCALL: 2 }), // call soft-deleted
        rv({ Z_PK: 3, ZCALL: 99 }), // no such call
        rv({ Z_PK: 4, ZCALL: null }), // orphan
      ],
    })
    expect(result.visits.map((v) => v.id)).toEqual(['mytime-rv-1'])
  })
})

describe('mapMytimeData — additional information', () => {
  it("maps a 'Phone' attribute to contact.phone", () => {
    const result = map({
      calls: [call({ Z_PK: 1 })],
      additionalInfoTypes: BUILTIN_INFO_TYPES,
      additionalInfo: [
        info({ Z_PK: 1, ZCALL: 1, ZTYPE: 4, ZVALUE: '555-1212' }),
      ],
    })
    expect(result.contacts[0].phone).toBe('555-1212')
  })

  it("maps a 'Mobile Phone' attribute to contact.phone", () => {
    const result = map({
      calls: [call({ Z_PK: 1 })],
      additionalInfoTypes: BUILTIN_INFO_TYPES,
      additionalInfo: [
        info({ Z_PK: 1, ZCALL: 1, ZTYPE: 3, ZVALUE: '555-9999' }),
      ],
    })
    expect(result.contacts[0].phone).toBe('555-9999')
  })

  it("maps an 'Email' attribute to contact.email", () => {
    const result = map({
      calls: [call({ Z_PK: 1 })],
      additionalInfoTypes: BUILTIN_INFO_TYPES,
      additionalInfo: [
        info({ Z_PK: 1, ZCALL: 1, ZTYPE: 1, ZVALUE: 'jane@example.com' }),
      ],
    })
    expect(result.contacts[0].email).toBe('jane@example.com')
  })

  it('ignores attributes with a blank value', () => {
    const result = map({
      calls: [call({ Z_PK: 1 })],
      additionalInfoTypes: BUILTIN_INFO_TYPES,
      additionalInfo: [info({ Z_PK: 1, ZCALL: 1, ZTYPE: 4, ZVALUE: '   ' })],
    })
    expect(result.contacts[0].phone).toBeUndefined()
  })

  it('preserves a user-defined attribute type as a custom field', () => {
    const result = map({
      calls: [call({ Z_PK: 1 })],
      additionalInfoTypes: [...BUILTIN_INFO_TYPES, infoType(5, 'Best time')],
      additionalInfo: [
        info({ Z_PK: 1, ZCALL: 1, ZTYPE: 5, ZVALUE: 'Evenings' }),
      ],
    })

    expect(result.customFieldDefs).toEqual([
      expect.objectContaining({ id: 'mytime-infotype-5', label: 'Best time' }),
    ])
    expect(result.contacts[0].customFields).toEqual({
      'mytime-infotype-5': 'Evenings',
    })
  })

  it('emits one shared custom field definition across contacts', () => {
    const result = map({
      calls: [call({ Z_PK: 1 }), call({ Z_PK: 2 })],
      additionalInfoTypes: [...BUILTIN_INFO_TYPES, infoType(5, 'Best time')],
      additionalInfo: [
        info({ Z_PK: 1, ZCALL: 1, ZTYPE: 5, ZVALUE: 'Evenings' }),
        info({ Z_PK: 2, ZCALL: 2, ZTYPE: 5, ZVALUE: 'Mornings' }),
      ],
    })

    expect(result.customFieldDefs).toHaveLength(1)
    expect(result.contacts[1].customFields).toEqual({
      'mytime-infotype-5': 'Mornings',
    })
  })
})

describe('mapMytimeData — contact notes (decision 3)', () => {
  it('seeds a contact Notes attribute onto the earliest visit', () => {
    const result = map({
      calls: [call({ Z_PK: 1 })],
      additionalInfoTypes: BUILTIN_INFO_TYPES,
      additionalInfo: [
        info({ Z_PK: 1, ZCALL: 1, ZTYPE: 2, ZVALUE: 'Door code 1234' }),
      ],
      returnVisits: [
        rv({ Z_PK: 1, ZCALL: 1, ZDATE: 100000000 }), // later
        rv({ Z_PK: 2, ZCALL: 1, ZDATE: 0 }), // earliest
      ],
    })

    const earliest = result.visits.find((v) => v.id === 'mytime-rv-2')
    const later = result.visits.find((v) => v.id === 'mytime-rv-1')
    expect(earliest?.note).toBe('Door code 1234')
    expect(later?.note).toBeUndefined()
    // The Notes attribute must not leak into custom fields.
    expect(result.customFieldDefs).toHaveLength(0)
    expect(result.contacts[0].customFields).toBeUndefined()
  })

  it('appends to an existing note rather than overwriting it', () => {
    const result = map({
      calls: [call({ Z_PK: 1 })],
      additionalInfoTypes: BUILTIN_INFO_TYPES,
      additionalInfo: [
        info({ Z_PK: 1, ZCALL: 1, ZTYPE: 2, ZVALUE: 'Door code 1234' }),
      ],
      returnVisits: [
        rv({ Z_PK: 1, ZCALL: 1, ZDATE: 0, ZNOTES: 'Spoke about hope' }),
      ],
    })

    expect(result.visits[0].note).toBe('Spoke about hope\n\nDoor code 1234')
  })

  it('synthesizes a visit dated to the note when the contact has none', () => {
    const result = map({
      calls: [call({ Z_PK: 1 })],
      additionalInfoTypes: BUILTIN_INFO_TYPES,
      additionalInfo: [
        info({
          Z_PK: 1,
          ZCALL: 1,
          ZTYPE: 2,
          ZVALUE: 'Met at the door',
          ZDATE: 0,
        }),
      ],
    })

    expect(result.visits).toHaveLength(1)
    expect(result.visits[0]).toMatchObject({
      id: 'mytime-call-1-note',
      contact: { id: 'mytime-call-1' },
      note: 'Met at the door',
      isBibleStudy: false,
    })
    expect(result.visits[0].date.toISOString()).toBe('2001-01-01T00:00:00.000Z')
  })

  it('dates a synthesized note-visit to the most-recent-visit date when the note has none', () => {
    const result = map({
      calls: [call({ Z_PK: 1, ZMOSTRECENTRETURNVISITDATE: 0 })],
      additionalInfoTypes: BUILTIN_INFO_TYPES,
      additionalInfo: [
        info({ Z_PK: 1, ZCALL: 1, ZTYPE: 2, ZVALUE: 'Note text', ZDATE: null }),
      ],
    })

    expect(result.visits[0].date.toISOString()).toBe('2001-01-01T00:00:00.000Z')
  })

  it('falls back to the import time when no date is available at all', () => {
    const result = map({
      calls: [call({ Z_PK: 1 })],
      additionalInfoTypes: BUILTIN_INFO_TYPES,
      additionalInfo: [
        info({ Z_PK: 1, ZCALL: 1, ZTYPE: 2, ZVALUE: 'Note text', ZDATE: null }),
      ],
    })

    expect(result.visits[0].date).toEqual(IMPORTED_AT)
  })
})

describe('mapMytimeData — time entries', () => {
  it("maps a 'Hours' ZTIMEENTRY to a category-less TimeEntry", () => {
    const result = map({
      timeTypes: [HOURS_TYPE],
      timeEntries: [
        timeEntry({ Z_PK: 5, ZMINUTES: 90, ZTYPE: 1, ZDATE: 0, ZNOTES: 'AM' }),
      ],
    })

    expect(result.timeEntries).toHaveLength(1)
    expect(result.timeEntries[0]).toMatchObject({
      id: 'mytime-time-5',
      hours: 1,
      minutes: 30,
      note: 'AM',
    })
    expect(result.timeEntries[0].categoryId).toBeUndefined()
    expect(result.timeEntries[0].date.toISOString()).toBe(
      '2001-01-01T00:00:00.000Z'
    )
    // "Hours" is the standard bucket — it must not seed a Category.
    expect(result.categories).toHaveLength(0)
  })

  it("maps an 'LDC' entry to the builtin LDC credit category", () => {
    const result = map({
      timeTypes: [HOURS_TYPE, LDC_TYPE],
      timeEntries: [timeEntry({ Z_PK: 1, ZMINUTES: 60, ZTYPE: 2 })],
    })

    expect(result.timeEntries[0]).toMatchObject({
      categoryId: LDC_BUILTIN_CATEGORY_ID,
      credit: true,
    })
    expect(result.categories).toEqual([
      expect.objectContaining({
        id: LDC_BUILTIN_CATEGORY_ID,
        name: 'LDC',
        isCredit: true,
        builtin: true,
      }),
    ])
  })

  it("maps an 'RBC' entry to the builtin LDC credit category (RBC is credit)", () => {
    const result = map({
      timeTypes: [HOURS_TYPE, timeType({ Z_PK: 3, ZNAME: 'RBC' })],
      timeEntries: [timeEntry({ Z_PK: 1, ZMINUTES: 120, ZTYPE: 3 })],
    })

    expect(result.timeEntries[0].categoryId).toBe(LDC_BUILTIN_CATEGORY_ID)
    expect(result.timeEntries[0].credit).toBe(true)
    expect(result.categories).toHaveLength(1)
    expect(result.categories[0].id).toBe(LDC_BUILTIN_CATEGORY_ID)
  })

  it('seeds the LDC category once even across many LDC entries', () => {
    const result = map({
      timeTypes: [LDC_TYPE],
      timeEntries: [
        timeEntry({ Z_PK: 1, ZMINUTES: 60, ZTYPE: 2 }),
        timeEntry({ Z_PK: 2, ZMINUTES: 60, ZTYPE: 2 }),
      ],
    })
    expect(result.categories).toHaveLength(1)
  })

  it('preserves a user-defined non-credit time type as a named category', () => {
    const result = map({
      timeTypes: [
        timeType({ Z_PK: 7, ZNAME: 'Cart Witnessing', ZDIRECTCREDIT: 0 }),
      ],
      timeEntries: [timeEntry({ Z_PK: 1, ZMINUTES: 45, ZTYPE: 7 })],
    })

    expect(result.categories).toEqual([
      expect.objectContaining({
        id: 'mytime-timetype-7',
        name: 'Cart Witnessing',
        isCredit: false,
      }),
    ])
    expect(result.timeEntries[0].categoryId).toBe('mytime-timetype-7')
    expect(result.timeEntries[0].credit).toBeUndefined()
  })

  it('honors ZDIRECTCREDIT for a user-defined credit time type', () => {
    const result = map({
      timeTypes: [timeType({ Z_PK: 7, ZNAME: 'Bethel', ZDIRECTCREDIT: 1 })],
      timeEntries: [timeEntry({ Z_PK: 1, ZMINUTES: 45, ZTYPE: 7 })],
    })

    expect(result.categories[0].isCredit).toBe(true)
    expect(result.timeEntries[0].credit).toBe(true)
  })
})

describe('mapMytimeData — synthesized monthly residual (decision 1)', () => {
  it("synthesizes one TimeEntry for a month's Hours adjustment", () => {
    const result = map({
      statisticsAdjustments: [
        adjustment({
          Z_PK: 1,
          ZTYPE: 'Hours',
          ZTIMESTAMP: 202509,
          ZADJUSTMENT: 3000,
        }),
      ],
    })

    expect(result.timeEntries).toHaveLength(1)
    expect(result.timeEntries[0]).toMatchObject({
      id: 'mytime-hours-202509',
      hours: 50,
      minutes: 0,
    })
    expect(result.timeEntries[0].categoryId).toBeUndefined()
    // Buckets into September 2025 (noon UTC survives date normalization).
    expect(result.timeEntries[0].date.toISOString()).toBe(
      '2025-09-01T12:00:00.000Z'
    )
  })

  it('skips zero-delta Hours adjustments (the common case)', () => {
    const result = map({
      statisticsAdjustments: [
        adjustment({
          Z_PK: 1,
          ZTYPE: 'Hours',
          ZTIMESTAMP: 202509,
          ZADJUSTMENT: 0,
        }),
        adjustment({
          Z_PK: 2,
          ZTYPE: 'Hours',
          ZTIMESTAMP: 202510,
          ZADJUSTMENT: 0,
        }),
      ],
    })
    expect(result.timeEntries).toHaveLength(0)
  })

  it('ignores non-Hours adjustment types (studies, return visits, etc.)', () => {
    const result = map({
      statisticsAdjustments: [
        adjustment({
          Z_PK: 1,
          ZTYPE: 'Bible Studies',
          ZTIMESTAMP: 202509,
          ZADJUSTMENT: 2,
        }),
        adjustment({
          Z_PK: 2,
          ZTYPE: 'Return Visits',
          ZTIMESTAMP: 202509,
          ZADJUSTMENT: -3,
        }),
      ],
    })
    expect(result.timeEntries).toHaveLength(0)
  })

  it('represents a negative Hours adjustment so the month total still matches', () => {
    const result = map({
      statisticsAdjustments: [
        adjustment({
          Z_PK: 1,
          ZTYPE: 'Hours',
          ZTIMESTAMP: 202401,
          ZADJUSTMENT: -90,
        }),
      ],
    })
    const e = result.timeEntries[0]
    expect(e.hours * 60 + e.minutes).toBe(-90)
  })
})

describe('mapMytimeData — publisher', () => {
  it('is null when the backup has no user', () => {
    expect(map({}).publisher).toBeNull()
  })

  it('maps each MyTime publisher type to a WitnessWork role', () => {
    const roleFor = (ztype: string) =>
      map({ users: [user({ Z_PK: 1, ZPUBLISHERTYPE: ztype })] }).publisher?.role

    expect(roleFor('Publisher')).toBe('publisher')
    expect(roleFor('Auxilliary Pioneer')).toBe('regularAuxiliary') // MyTime's spelling
    expect(roleFor('Pioneer')).toBe('regularPioneer')
    expect(roleFor('Special Pioneer')).toBe('specialPioneer')
    expect(roleFor('Traveling Servant')).toBe('circuitOverseer')
  })

  it('defaults an unknown or missing publisher type to regular publisher', () => {
    expect(
      map({ users: [user({ Z_PK: 1, ZPUBLISHERTYPE: 'Elder?' })] }).publisher
        ?.role
    ).toBe('publisher')
    expect(map({ users: [user({ Z_PK: 1 })] }).publisher?.role).toBe(
      'publisher'
    )
  })

  it('converts ZPIONEERSTARTDATE to the tenure start date', () => {
    const result = map({
      users: [
        user({
          Z_PK: 1,
          ZPUBLISHERTYPE: 'Pioneer',
          ZPIONEERSTARTDATE: -357654799,
        }),
      ],
    })
    expect(result.publisher?.tenureStartDate?.toISOString()).toBe(
      '1989-09-01T11:26:41.000Z'
    )
  })

  it('leaves tenure start date null when absent', () => {
    const result = map({
      users: [user({ Z_PK: 1, ZPUBLISHERTYPE: 'Pioneer' })],
    })
    expect(result.publisher?.tenureStartDate).toBeNull()
  })
})

describe('mapMytimeData — realistic backup shape', () => {
  it('translates a small end-to-end backup the way the real one is shaped', () => {
    const result = map({
      users: [
        user({
          Z_PK: 1,
          ZPUBLISHERTYPE: 'Pioneer',
          ZPIONEERSTARTDATE: -357654799,
        }),
      ],
      calls: [
        call({ Z_PK: 1, ZNAME: 'Live Contact', ZSTREET: 'Main St' }),
        call({ Z_PK: 2, ZNAME: 'Deleted', ZDELETEDCALL: 1 }),
      ],
      additionalInfoTypes: BUILTIN_INFO_TYPES,
      additionalInfo: [
        info({ Z_PK: 1, ZCALL: 1, ZTYPE: 4, ZVALUE: '555-1212' }),
        info({ Z_PK: 2, ZCALL: 1, ZTYPE: 2, ZVALUE: 'Leave by side gate' }),
        info({ Z_PK: 3, ZCALL: 2, ZTYPE: 4, ZVALUE: 'gone' }), // on deleted call
      ],
      returnVisits: [
        rv({ Z_PK: 1, ZCALL: 1, ZDATE: 0, ZTYPE: 'Initial Visit' }),
        rv({ Z_PK: 2, ZCALL: 2, ZDATE: 0 }), // belongs to deleted call
      ],
      timeTypes: [HOURS_TYPE, LDC_TYPE],
      timeEntries: [timeEntry({ Z_PK: 1, ZMINUTES: 120, ZTYPE: 2 })], // LDC
      statisticsAdjustments: [
        adjustment({
          Z_PK: 1,
          ZTYPE: 'Hours',
          ZTIMESTAMP: 202509,
          ZADJUSTMENT: 3000,
        }),
        adjustment({
          Z_PK: 2,
          ZTYPE: 'Return Visits',
          ZTIMESTAMP: 202509,
          ZADJUSTMENT: -3,
        }),
      ],
    })

    // One live contact, its deleted neighbor (and that neighbor's visit/info) gone.
    expect(result.contacts.map((c) => c.id)).toEqual(['mytime-call-1'])
    expect(result.contacts[0].phone).toBe('555-1212')
    expect(result.visits.map((v) => v.id)).toEqual(['mytime-rv-1'])
    // Contact note seeded onto its only visit.
    expect(result.visits[0].note).toBe('Leave by side gate')
    // LDC entry + the 50h residual; the Return Visits adjustment is ignored.
    expect(result.timeEntries.map((e) => e.id).sort()).toEqual([
      'mytime-hours-202509',
      'mytime-time-1',
    ])
    expect(result.categories[0].id).toBe(LDC_BUILTIN_CATEGORY_ID)
    expect(result.publisher).toEqual({
      role: 'regularPioneer',
      tenureStartDate: new Date('1989-09-01T11:26:41.000Z'),
    })
  })
})
