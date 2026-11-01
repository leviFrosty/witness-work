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

import {
  homeSectionTitle,
  isHomeSectionAvailable,
  moveHomeSection,
} from '@/lib/homeSections'
import {
  hideHomeSection,
  isHomeSectionOn,
  isHomeSectionShown,
  moveHomeSectionTo,
  showHomeSection,
} from '@/lib/homeSections'
import usePet from '@/stores/pet'
import {
  DEFAULT_HOME_SCREEN_ELEMENTS_ORDER,
  getEffectiveHomeScreenOrder,
  type HomeScreenElementKey,
  PREFERENCE_DEFAULTS,
  usePreferences,
} from '@/stores/preferences'
import { resetToasts, useToasts } from '@/stores/toasts'

const phone = {
  isTablet: false,
  hasAnnualGoal: true,
  showsTimer: true,
  mileageTrackingEnabled: true,
  buddiesAvailable: true,
}

describe('Home sections', () => {
  beforeEach(() => {
    usePreferences.setState({ ...PREFERENCE_DEFAULTS })
    resetToasts()
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
    expect(isHomeSectionAvailable('together', phone)).toBe(true)
    expect(
      isHomeSectionAvailable('together', { ...phone, buddiesAvailable: false })
    ).toBe(false)
  })

  it('always offers Quick Actions, whatever the device can do', () => {
    expect(isHomeSectionAvailable('quickActions', phone)).toBe(true)
    expect(
      isHomeSectionAvailable('quickActions', {
        isTablet: true,
        hasAnnualGoal: false,
        showsTimer: false,
        mileageTrackingEnabled: false,
        buddiesAvailable: false,
      })
    ).toBe(true)
  })

  it('names every section', () => {
    expect(homeSectionTitle('quickActions')).toBe('quickActions_sectionTitle')
    for (const key of DEFAULT_HOME_SCREEN_ELEMENTS_ORDER)
      expect(homeSectionTitle(key)).toBeTruthy()
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
    const [shown] = useToasts.getState().toasts
    expect(shown?.intent).toBe('undo')
    expect(shown?.title).toBe('homeEdit.removed')
    shown?.action?.onPress()
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

  describe('Together', () => {
    const shown = (
      homeScreenElements: Partial<
        Record<HomeScreenElementKey, boolean>
      > = usePreferences.getState().homeScreenElements
    ) =>
      isHomeSectionShown('together', {
        homeScreenElements,
        petPromptDismissed: false,
        hasPet: false,
      })

    it('waits for the User to add it', () => {
      expect(shown()).toBe(false)

      expect(shown({ serviceReport: true })).toBe(false)
      expect(isHomeSectionOn('timer', { serviceReport: true })).toBe(true)
    })

    it('shows at the top once added', () => {
      showHomeSection('together')
      expect(shown()).toBe(true)
      expect(
        getEffectiveHomeScreenOrder(
          usePreferences.getState().homeScreenElementsOrder
        )[0]
      ).toBe('together')
    })
  })

  describe('Pet before a companion', () => {
    const shown = () =>
      isHomeSectionShown('pet', {
        ...usePreferences.getState(),
        hasPet: usePet.getState().pet !== null,
      })

    it('counts the offer answered Not now as hidden', () => {
      expect(shown()).toBe(true)
      usePreferences.setState({ petPromptDismissed: true })
      expect(shown()).toBe(false)
    })

    it('brings the offer back when Pet is shown again', () => {
      usePreferences.setState({ petPromptDismissed: true })
      showHomeSection('pet')
      expect(usePreferences.getState().petPromptDismissed).toBe(false)
      expect(shown()).toBe(true)
    })

    it('leaves Not now alone with a companion', () => {
      usePet
        .getState()
        .adopt({ species: 'lamb', coat: 'default', today: '2026-10-18' })
      usePreferences.setState({ petPromptDismissed: true })
      expect(shown()).toBe(true)
      showHomeSection('pet')
      expect(usePreferences.getState().petPromptDismissed).toBe(true)
      usePet.getState()._WARNING_forceDeletePet()
    })
  })
})
