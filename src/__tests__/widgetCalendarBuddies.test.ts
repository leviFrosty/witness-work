import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: Record<string, string>) =>
      `${key}:${Object.values(options ?? {}).join('|')}`,
  },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({ timeDisplayFormat: 'decimal' }),
}))
// `buddyDisplayName` lives beside the profile helpers and their native deps.
vi.mock('expo-image-manipulator', () => ({}))
vi.mock('@/stores/profile', () => ({ useProfile: {} }))
vi.mock('@/features/buddies/stores/buddiesStore', () => ({ useBuddies: {} }))

import {
  buildCalendar,
  type BuildCalendarArgs,
} from '@/app/widgets/buildCalendar'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'
import type { Buddy } from '@/features/buddies/lib/state'

const buddy = (inboxId: string, overrides: Partial<Buddy> = {}): Buddy => ({
  inboxId,
  name: inboxId,
  dhPub: '',
  inviteSecret: '',
  status: 'active',
  pairedAt: 0,
  colorIndex: 0,
  showOnCalendar: true,
  ...overrides,
})

const args = (
  buddyMarkers: Record<string, BuddyDayMarker>
): BuildCalendarArgs => ({
  serviceReports: {},
  dayPlans: [],
  recurringPlans: [],
  publisher: 'regularPioneer',
  logsHours: true,
  startOfWeek: 0,
  buddyMarkers,
})

const day = (calendar: ReturnType<typeof buildCalendar>, date: string) =>
  calendar.days.find((d) => d.date === date)

describe('buildCalendar buddies', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 12))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stacks up to three avatars for buddies the User goes out with', () => {
    const ana = buddy('ana', { name: ' ana', avatar: { t: 'emoji', v: '🌻' } })
    const ben = buddy('ben', { name: 'Ben', avatar: { t: 'image', v: 'AAAA' } })
    const cy = buddy('cy', { name: 'Cy', nickname: 'Uncle Cy' })
    const calendar = buildCalendar(
      args({
        '2026-10-08': { withBuddies: [ana, ben, cy], goingOut: [] },
      })
    )

    expect(day(calendar, '2026-10-08')?.buddies).toEqual({
      withIds: ['ana', 'ben', 'cy'],
      more: 0,
      goingOut: false,
      label: 'buddies_withName: ana, Ben, Uncle Cy',
    })
    expect(calendar.buddies).toEqual([
      { id: 'ana', initial: 'A', emoji: '🌻', image: null },
      { id: 'ben', initial: 'B', emoji: null, image: 'AAAA' },
      { id: 'cy', initial: 'U', emoji: null, image: null },
    ])
  })

  it('counts the rest when more than three go out together', () => {
    const five = ['ana', 'ben', 'cy', 'dee', 'eli'].map((id) => buddy(id))
    const calendar = buildCalendar(
      args({ '2026-10-08': { withBuddies: five, goingOut: [] } })
    )

    expect(day(calendar, '2026-10-08')?.buddies).toMatchObject({
      withIds: ['ana', 'ben'],
      more: 3,
    })
    expect(calendar.buddies.map((b) => b.id)).toEqual(['ana', 'ben'])
  })

  it('uses the nickname the User gave a buddy', () => {
    const calendar = buildCalendar(
      args({
        '2026-10-08': {
          withBuddies: [buddy('ana', { name: 'Ana', nickname: 'Mom' })],
          goingOut: [],
        },
        '2026-10-09': {
          withBuddies: [],
          goingOut: [buddy('dee', { name: 'Dee', nickname: 'Sis' })],
        },
      })
    )

    expect(day(calendar, '2026-10-08')?.buddies?.label).toBe(
      'buddies_withName:Mom'
    )
    expect(day(calendar, '2026-10-09')?.buddies?.label).toBe(
      'buddies_calendarGoingOut:Sis'
    )
    expect(calendar.buddies[0].initial).toBe('M')
  })

  it('marks days other buddies go out with a dot', () => {
    const calendar = buildCalendar(
      args({
        '2026-10-09': { withBuddies: [], goingOut: [buddy('Dee')] },
      })
    )

    expect(day(calendar, '2026-10-09')?.buddies).toEqual({
      withIds: [],
      more: 0,
      goingOut: true,
      label: 'buddies_calendarGoingOut:Dee',
    })
    expect(calendar.buddies).toEqual([])
  })

  it('leaves other months and unmarked days without a badge', () => {
    const calendar = buildCalendar(
      args({
        '2026-11-02': { withBuddies: [buddy('ana')], goingOut: [] },
      })
    )

    expect(day(calendar, '2026-11-02')?.buddies).toBeNull()
    expect(day(calendar, '2026-10-10')?.buddies).toBeNull()
    expect(calendar.buddies).toEqual([])
  })

  it('sends no buddies while the calendar is locked', () => {
    const calendar = buildCalendar({
      ...args({ '2026-10-08': { withBuddies: [buddy('ana')], goingOut: [] } }),
      publisher: 'publisher',
      logsHours: false,
    })

    expect(calendar.locked).toBe(true)
    expect(calendar.buddies).toEqual([])
  })
})
