import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: {
    OS: 'ios',
    select: (options: { ios?: unknown }) => options.ios,
  },
  AppState: { currentState: 'active', addEventListener: vi.fn() },
}))
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid',
  getRandomBytes: (count: number) => new Uint8Array(count),
}))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('expo-notifications', () => ({
  cancelScheduledNotificationAsync: vi.fn(),
}))
vi.mock('@/lib/contactAvatarFiles', () => ({
  deleteAvatarFiles: vi.fn(async () => {}),
}))

const {
  BUDDIES,
  CONTACTS,
  DAY_PLANS,
  NOW,
  PREFERENCES,
  fixtureContext,
  fixtureStores,
} = await import('@/features/scribe/tools/__fixtures__/stores')
const { emptyRefTable, RefRegistry } = await import(
  '@/features/scribe/runtime/refs'
)
const {
  buildScribeContext,
  CONTEXT_MAX_CONTACTS,
  CONTEXT_MAX_PLANS,
  contactsByRecency,
} = await import('@/features/scribe/runtime/snapshot')
const { DEFAULT_SCRIBE_LIMITS } = await import('@/features/scribe/lib/wire')
type ScribeStores = import('@/features/scribe/runtime/snapshot').ScribeStores
type Contact = import('@/types/contact').Contact
type DayPlan = import('@/types/timeEntry').DayPlan

const ENV = { locale: 'en-US', tz: 'America/Chicago' }
const build = (
  stores: ScribeStores,
  refs = new RefRegistry(emptyRefTable()),
  now = NOW
) => buildScribeContext(stores, refs, { ...ENV, now })

const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length

const FIRST = [
  'Maria',
  'Ana',
  'Joseph',
  'Grace',
  'Samuel',
  'Olivia',
  'Daniel',
  'Ruth',
]
const LAST = [
  'Lopez',
  'Okafor',
  'Nguyen',
  'Silva',
  'Martin',
  'Kowalski',
  'Haddad',
  'Park',
]

/** `count` Contacts with everyday names, created a day apart. */
const manyContacts = (count: number): Contact[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `contact-${String(index).padStart(4, '0')}`,
    name: `${FIRST[index % FIRST.length]} ${LAST[Math.floor(index / FIRST.length) % LAST.length]}`,
    createdAt: new Date(2025, 0, 1 + index),
  }))

/** `count` Day Plans spread over the next 20 days, some with titles. */
const manyPlans = (count: number): DayPlan[] =>
  Array.from({ length: count }, (_, index) => {
    const day = new Date(Date.UTC(2026, 9, 21 + (index % 20), 12))
    return {
      id: `plan-${String(index).padStart(3, '0')}`,
      date: day,
      minutes: 60 + (index % 4) * 30,
      startTimeInMinutes: 8 * 60 + (index % 10) * 30,
      ...(index % 3 === 0 ? { title: 'Cart witnessing at the station' } : {}),
    } as DayPlan
  })

describe('buildScribeContext', () => {
  it('has the protocol shape', () => {
    const context = build(fixtureStores())
    expect(Object.keys(context).sort()).toEqual(
      [
        'v',
        'now',
        'tz',
        'locale',
        'weekStart',
        'clock',
        'days',
        'publisher',
        'month',
        'categories',
        'plans',
        'contacts',
        'contactsTruncated',
        'buddies',
        'dataProtection',
        'memory',
      ].sort()
    )
    expect(context).toMatchObject({
      v: 1,
      tz: 'America/Chicago',
      locale: 'en-US',
      weekStart: 0,
      clock: '12h',
      dataProtection: false,
      contactsTruncated: false,
    })
    expect(context.now.startsWith('2026-10-21T09:30:00')).toBe(true)
  })

  it('sends the memory one note a line, and null while it is off', () => {
    const text =
      'Says "group" for the Saturday car group\n\n  Prefers 24h times  \n'
    expect(
      build(fixtureStores({ memory: { enabled: true, text } })).memory
    ).toEqual(['Says "group" for the Saturday car group', 'Prefers 24h times'])
    expect(build(fixtureStores()).memory).toEqual([])
    expect(
      build(fixtureStores({ memory: { enabled: false, text } })).memory
    ).toBeNull()
  })

  it('names 22 days, today − 7 … today + 14, with English weekdays', () => {
    const { days } = build(fixtureStores())
    expect(days).toHaveLength(22)
    expect(days[0]).toBe('Wed 2026-10-14')
    expect(days[7]).toBe('Wed 2026-10-21')
    expect(days[8]).toBe('Thu 2026-10-22')
    expect(days[21]).toBe('Wed 2026-11-04')
    for (const day of days)
      expect(day).toMatch(/^[A-Z][a-z]{2} \d{4}-\d{2}-\d{2}$/)
  })

  it("states this month's publisher and progress", () => {
    const { publisher, month } = build(fixtureStores())
    expect(publisher).toEqual({
      role: 'regularPioneer',
      entryMode: 'hours',
      showsTimeEntry: true,
      monthlyGoalMinutes: 3000,
      creditCapMinutes: 3300,
    })
    // 2 h + 1 h 30 standard and 1 h Bethel credit; Thu 2 h, Sat 3 h and
    // Monday's 1 h still planned this month.
    expect(month).toEqual({
      month: '2026-10',
      loggedMinutes: 270,
      creditMinutes: 60,
      plannedRemainingMinutes: 360,
      studies: 1,
    })
  })

  it('says a Regular Publisher reports only whether they shared', () => {
    const { publisher } = build(
      fixtureStores({ preferences: { ...PREFERENCES, role: 'publisher' } })
    )
    expect(publisher).toMatchObject({
      role: 'publisher',
      entryMode: 'checkbox',
      showsTimeEntry: false,
      monthlyGoalMinutes: null,
    })
  })

  it('logs hours as said during setup, before the User picks a role', () => {
    // Setup asks the role after Pick up where you left off, so a pioneer
    // bringing over a log of hours mustn't get "shared" marks instead.
    const { publisher } = build(
      fixtureStores({
        preferences: {
          ...PREFERENCES,
          role: 'publisher',
          onboardingComplete: false,
        },
      })
    )
    expect(publisher).toEqual({
      role: 'not_chosen',
      entryMode: 'hours',
      showsTimeEntry: true,
      monthlyGoalMinutes: null,
      creditCapMinutes: null,
    })
  })

  it('resolves Start of Week and Clock Format from the preferences', () => {
    const context = build(
      fixtureStores({
        preferences: { ...PREFERENCES, startOfWeek: 1, timeFormat: '24' },
      })
    )
    expect(context.weekStart).toBe(1)
    expect(context.clock).toBe('24h')
  })

  it('lists k0 Standard first, then Categories by name, marking credit', () => {
    const { categories } = build(
      fixtureStores({
        categories: [
          { id: 'category-hospital', name: 'Hospital', isCredit: false },
          { id: 'category-bethel', name: 'Bethel', isCredit: true },
        ],
      })
    )
    expect(categories).toEqual([
      'k0 Standard',
      'k1 Bethel credit',
      'k2 Hospital',
    ])
  })

  it('lists plans today … today + 13 with p and r Refs', () => {
    const { plans } = build(fixtureStores())
    expect(plans).toEqual([
      'p1 2026-10-22 120m 09:00 k0',
      'p2 2026-10-24 180m anytime k0 "Group witnessing"',
      'r1 2026-10-26 60m 18:00 k0',
      'r2 2026-11-02 60m 18:00 k0',
    ])
  })

  it('names the confirmed buddies going along on a Day Plan', () => {
    const buddies = [
      { ...BUDDIES[0], inboxId: 'inbox-ana', nickname: 'Ana', pairedAt: 1 },
      { ...BUDDIES[0], inboxId: 'inbox-sam', nickname: 'Sam', pairedAt: 2 },
    ]
    const { plans, buddies: listed } = build(
      fixtureStores({
        buddies: [...buddies].reverse(),
        dayPlans: [
          // A buddy who isn't confirmed anymore is left out.
          { ...DAY_PLANS[0], buddies: ['inbox-sam', 'inbox-gone'] },
          {
            ...DAY_PLANS[1],
            buddies: ['inbox-sam'],
            buddyShare: { from: 'inbox-ana', shareId: 'share-1' },
          },
        ],
      })
    )
    // Buddies keep their pairing order, whichever Plan names them first.
    expect(listed).toEqual(['b1 Ana', 'b2 Sam'])
    expect(plans.slice(0, 2)).toEqual([
      'p1 2026-10-22 120m 09:00 k0 with b2',
      'p2 2026-10-24 180m anytime k0 "Group witnessing" with b2,b1',
    ])
  })

  it('orders Contacts by their latest Visit, then by creation', () => {
    const stores = fixtureStores()
    const { contacts } = build(stores)
    // Ben was visited on the 19th, Maria Lopez on the 14th; Maria Chen never.
    expect(contacts).toEqual([
      'c1 Ben Okafor',
      'c2 Maria Lopez',
      'c3 Maria Chen',
    ])
    expect(contactsByRecency(stores).map((contact) => contact.id)).toEqual([
      'contact-ben',
      'contact-maria-lopez',
      'contact-maria-chen',
    ])
  })

  it('lists confirmed buddies only, by nickname, at most 5', () => {
    const buddies = Array.from({ length: 7 }, (_, index) => ({
      ...BUDDIES[0],
      inboxId: `inbox-${index}`,
      name: `Buddy ${index}`,
      nickname: index === 0 ? 'Nick' : undefined,
      pairedAt: index,
    }))
    buddies[1] = { ...buddies[1], status: 'awaitingConfirm' }
    const context = build(fixtureStores({ buddies }))
    expect(context.buddies).toEqual([
      'b1 Nick',
      'b2 Buddy 2',
      'b3 Buddy 3',
      'b4 Buddy 4',
      'b5 Buddy 5',
    ])
  })

  it('caps Contacts at 150 and plans at 40, and stays under 6 KB', () => {
    const stores = fixtureStores({
      contacts: manyContacts(1_000),
      visits: [],
      dayPlans: manyPlans(100),
    })
    const context = build(stores)
    expect(context.contacts).toHaveLength(CONTEXT_MAX_CONTACTS)
    expect(context.contactsTruncated).toBe(true)
    expect(context.plans).toHaveLength(CONTEXT_MAX_PLANS)
    expect(bytes(context)).toBeLessThanOrEqual(6 * 1024)
  })

  it('clips long names and titles', () => {
    const context = build(
      fixtureStores({
        contacts: [{ ...CONTACTS[0], name: `${'Long name '.repeat(8)}end` }],
        dayPlans: [
          {
            id: 'plan-long',
            date: new Date(Date.UTC(2026, 9, 22, 12)),
            minutes: 60,
            anytime: true,
            title: 'A very long plan title that goes on and on and on',
          } as DayPlan,
        ],
        recurringPlans: [],
      })
    )
    expect(context.contacts[0].length).toBeLessThanOrEqual('c1 '.length + 40)
    expect(context.plans).toEqual([
      'p1 2026-10-22 60m anytime k0 "A very long plan title that goes on and"',
    ])
  })

  it('is byte-identical for identical stores', () => {
    expect(JSON.stringify(build(fixtureStores()))).toBe(
      JSON.stringify(build(fixtureStores()))
    )
    const big = { contacts: manyContacts(400), dayPlans: manyPlans(60) }
    expect(JSON.stringify(build(fixtureStores(big)))).toBe(
      JSON.stringify(build(fixtureStores(big)))
    )
  })

  it('leaves Contacts out in data protection mode', () => {
    const { context, ctx } = fixtureContext(
      fixtureStores({
        preferences: { ...PREFERENCES, dataProtectionMode: true },
      })
    )
    expect(context.contacts).toEqual([])
    expect(context.contactsTruncated).toBe(false)
    expect(context.dataProtection).toBe(true)
    expect(ctx.dataProtection).toBe(true)
    expect(JSON.stringify(context)).not.toContain('Maria')
  })

  it('rebuilds for a new day with the same Refs for the same records', () => {
    const stores = fixtureStores()
    const refs = new RefRegistry(emptyRefTable())
    const today = build(stores, refs)
    const tomorrow = build(stores, refs, new Date(2026, 9, 22, 7, 0))
    expect(tomorrow.days[0]).toBe('Thu 2026-10-15')
    expect(tomorrow.days[7]).toBe('Thu 2026-10-22')
    expect(tomorrow.now.startsWith('2026-10-22T07:00:00')).toBe(true)
    expect(tomorrow.contacts).toEqual(today.contacts)
    expect(tomorrow.categories).toEqual(today.categories)
    // Thursday's plan is still p1; a newly visible Monday gets the next r Ref.
    expect(tomorrow.plans).toEqual([
      'p1 2026-10-22 120m 09:00 k0',
      'p2 2026-10-24 180m anytime k0 "Group witnessing"',
      'r1 2026-10-26 60m 18:00 k0',
      'r2 2026-11-02 60m 18:00 k0',
    ])
    expect(today.month.plannedRemainingMinutes).toBe(360)
    expect(tomorrow.month.plannedRemainingMinutes).toBe(360)
  })

  it('moves to the next month when the day does', () => {
    const context = build(fixtureStores(), undefined, new Date(2026, 10, 1, 8))
    expect(context.month).toMatchObject({
      month: '2026-11',
      loggedMinutes: 0,
      creditMinutes: 0,
    })
    expect(context.days[7]).toBe('Sun 2026-11-01')
  })

  it('stays well under maxContextBytes for a heavy User', () => {
    const contacts = manyContacts(1_000)
    const visits = contacts.slice(0, 300).map(
      (contact, index) =>
        ({
          id: `visit-${index}`,
          contact: { id: contact.id },
          date: new Date(2026, 9, 1 + (index % 20), 10),
          note: 'Long note '.repeat(50),
          followUp: {
            date: new Date(2026, 9, 10 + (index % 25), 10),
            notifyMe: false,
            topic: 'A long topic '.repeat(10),
          },
        }) as ScribeStores['visits'][number]
    )
    const context = build(
      fixtureStores({
        contacts,
        visits,
        dayPlans: manyPlans(100),
        categories: Array.from({ length: 20 }, (_, index) => ({
          id: `category-${index}`,
          name: `Category with a long name number ${index}`,
          isCredit: index % 2 === 0,
        })),
      })
    )
    expect(JSON.stringify(context)).not.toContain('Long note')
    expect(bytes(context)).toBeLessThanOrEqual(
      DEFAULT_SCRIBE_LIMITS.maxContextBytes / 2
    )
  })

  it('never writes to the stores it reads', () => {
    const stores = fixtureStores()
    const before = structuredClone(stores)
    build(stores)
    expect(stores).toEqual(before)
  })
})
