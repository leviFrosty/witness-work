import { describe, expect, it, vi } from 'vitest'

vi.mock('lucide-react-native', () => ({
  BookUser: 'BookUser',
  CalendarDays: 'CalendarDays',
  CalendarSync: 'CalendarSync',
  Car: 'Car',
  CirclePlus: 'CirclePlus',
  HardDriveDownload: 'HardDriveDownload',
  LayoutGrid: 'LayoutGrid',
  Medal: 'Medal',
  Moon: 'Moon',
  Send: 'Send',
  Timer: 'Timer',
  Users: 'Users',
  Watch: 'Watch',
}))
vi.mock('@/features/onboarding/components/tour/TimeVisual', () => ({
  default: 'TimeVisual',
}))
vi.mock('@/features/onboarding/components/tour/VisitsVisual', () => ({
  default: 'VisitsVisual',
}))
vi.mock('@/features/onboarding/components/tour/PlanVisual', () => ({
  default: 'PlanVisual',
}))
vi.mock('@/features/onboarding/components/tour/ReportVisual', () => ({
  default: 'ReportVisual',
}))

import {
  TOUR_MORE_LIMIT,
  TOUR_PAGES,
  tourMoreItems,
} from '@/features/onboarding/constants/tourPages'

const all = { buddies: true, watch: true, calendar: true }
const none = { buddies: false, watch: false, calendar: false }

const on = (os: 'ios' | 'android' | 'web') => (platform?: 'ios' | 'android') =>
  !platform || platform === os

const ids = (available: typeof all, os: 'ios' | 'android' | 'web'): string[] =>
  tourMoreItems(available, on(os)).map((item) => item.id)

describe('TOUR_PAGES', () => {
  it('keeps the five page ids analytics reports as last_page', () => {
    expect(TOUR_PAGES.map((page) => page.id)).toEqual([
      'track',
      'contacts',
      'plan',
      'report',
      'more',
    ])
  })

  it('gives every page but the tiles page a visual', () => {
    for (const page of TOUR_PAGES) {
      expect(Boolean(page.Visual)).toBe(page.id !== 'more')
    }
  })
})

describe('tourMoreItems', () => {
  it('shows at most six tiles, in order, on an iPhone with everything', () => {
    expect(ids(all, 'ios')).toEqual([
      'buddies',
      'badges',
      'widgets',
      'watch',
      'calendar',
      'backups',
    ])
    expect(ids(all, 'ios')).toHaveLength(TOUR_MORE_LIMIT)
  })

  it('fills the freed places when buddies, a watch and calendar are missing', () => {
    expect(ids(none, 'ios')).toEqual([
      'badges',
      'widgets',
      'backups',
      'mileage',
    ])
  })

  it('swaps the Apple tiles for dark mode on Android', () => {
    expect(ids(all, 'android')).toEqual([
      'buddies',
      'badges',
      'calendar',
      'backups',
      'mileage',
      'darkMode',
    ])
  })

  it('leaves out an Apple Watch that cannot pair', () => {
    expect(ids({ ...all, watch: false }, 'ios')).not.toContain('watch')
  })

  it('shows only the tiles every platform has on the web', () => {
    expect(ids(none, 'web')).toEqual(['badges', 'backups', 'mileage'])
  })
})
