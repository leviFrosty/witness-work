import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/lib/locales', () => ({
  default: { t: (k: string) => k },
}))

import { isHomeSectionAvailable, moveHomeSection } from '@/lib/homeSections'
import {
  hideHomeSection,
  moveHomeSectionTo,
  showHomeSection,
} from '@/lib/homeSections'
import {
  DEFAULT_HOME_SCREEN_ELEMENTS_ORDER,
  getEffectiveHomeScreenOrder,
  PREFERENCE_DEFAULTS,
  usePreferences,
} from '@/stores/preferences'
import { useUndoToast } from '@/stores/undoToast'

const phone = {
  isTablet: false,
  hasAnnualGoal: true,
  showsTimer: true,
  mileageTrackingEnabled: true,
}

describe('Home sections', () => {
  beforeEach(() => {
    usePreferences.setState({ ...PREFERENCE_DEFAULTS })
    useUndoToast.setState({ toast: null })
  })

  it('offers only the sections this User and device can show', () => {
    expect(isHomeSectionAvailable('tabletServiceYearSummary', phone)).toBe(
      false
    )
    expect(
      isHomeSectionAvailable('tabletServiceYearSummary', {
        ...phone,
        isTablet: true,
      })
    ).toBe(true)
    expect(
      isHomeSectionAvailable('timer', { ...phone, showsTimer: false })
    ).toBe(false)
    expect(
      isHomeSectionAvailable('mileage', {
        ...phone,
        mileageTrackingEnabled: undefined,
      })
    ).toBe(false)
    expect(isHomeSectionAvailable('thisWeek', phone)).toBe(true)
  })

  it('moves a section to where it was dropped', () => {
    expect(
      moveHomeSection(
        ['serviceReport', 'thisWeek', 'timer'],
        'timer',
        'serviceReport'
      )
    ).toEqual(['timer', 'serviceReport', 'thisWeek'])
    expect(
      moveHomeSection(
        ['serviceReport', 'thisWeek'],
        'serviceReport',
        'thisWeek'
      )
    ).toEqual(['thisWeek', 'serviceReport'])
  })

  it('saves a drag to the stored order', () => {
    moveHomeSectionTo('didYouKnow', 'approachingConversations')
    expect(
      getEffectiveHomeScreenOrder(
        usePreferences.getState().homeScreenElementsOrder
      )[0]
    ).toBe('didYouKnow')
  })

  it('hides a section with an Undo that shows it again', () => {
    hideHomeSection('timer')
    expect(usePreferences.getState().homeScreenElements.timer).toBe(false)
    const toast = useUndoToast.getState().toast
    expect(toast?.message).toBe('homeEdit.removed')
    toast?.onUndo()
    expect(usePreferences.getState().homeScreenElements.timer).toBe(true)
  })

  it('shows a hidden section again at the top', () => {
    hideHomeSection('timer')
    showHomeSection('timer')
    const { homeScreenElements, homeScreenElementsOrder } =
      usePreferences.getState()
    expect(homeScreenElements.timer).toBe(true)
    expect(getEffectiveHomeScreenOrder(homeScreenElementsOrder)).toEqual([
      'timer',
      ...DEFAULT_HOME_SCREEN_ELEMENTS_ORDER.filter((k) => k !== 'timer'),
    ])
  })
})
