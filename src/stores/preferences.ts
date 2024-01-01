import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { Publisher, PublisherHours } from '../types/publisher'
import i18n from '../lib/locales'
import Constants from 'expo-constants'
import moment from 'moment'

const SortOptionValues = [
  'recentConversation',
  'az',
  'za',
  'bibleStudy',
] as const

export const contactSortOptions = [
  {
    label: i18n.t('recentConversation'),
    value: SortOptionValues[0],
  },
  {
    label: i18n.t('alphabeticalAsc'),
    value: SortOptionValues[1],
  },
  {
    label: i18n.t('alphabeticalDesc'),
    value: SortOptionValues[2],
  },
  {
    label: i18n.t('bibleStudy'),
    value: SortOptionValues[3],
  },
]

export type GoalHours = {
  month: Date
  hours: number
}

const publisherHours: PublisherHours = {
  publisher: 0,
  regularAuxiliary: 30,
  regularPioneer: 50,
  circuitOverseer: 50,
  specialPioneer: 100,
  custom: 50,
}

/**
 * @platform iOS: All Supported
 * @platform Android: Only 'google' is supported
 */
export type DefaultNavigationMapProvider = 'apple' | 'waze' | 'google' | null

interface TimeOffset {
  amount?: number
  unit?: moment.unitOfTime.DurationConstructor
}

const initialState = {
  publisher: 'publisher' as Publisher,
  publisherHours: publisherHours,

  /** Overrides publisherHours hour requirement for given month. */
  oneOffGoalHours: [] as GoalHours[],
  onboardingComplete: false,
  installedOn: new Date(),
  contactSort: 'recentConversation' as (typeof SortOptionValues)[number],
  hasCompletedMapOnboarding: false,
  calledGoecodeApiTimes: 0,
  lastTimeRequestedAReview: null as Date | null,

  /**
   * @platform iOS: Supported
   * @platform Android: Not Supported
   */
  defaultNavigationMapProvider: null as DefaultNavigationMapProvider,
  lastAppVersion: Constants.expoConfig?.version || null,
  returnVisitTimeOffset: null as TimeOffset | null,
  returnVisitNotificationOffset: null as TimeOffset | null,
  returnVisitAlwaysNotify: false,
  serviceReportTags: [] as string[],
  displayDetailsOnProgressBarHomeScreen: false,
}

export const usePreferences = create(
  persist(
    combine(initialState, (set) => ({
      set,
      setPublisher: (publisher: Publisher) => set({ publisher }),
      incrementGeocodeApiCallCount: () =>
        set(({ calledGoecodeApiTimes }) => ({
          calledGoecodeApiTimes: calledGoecodeApiTimes + 1,
        })),
      updateLastTimeRequestedStoreReview: () =>
        set({ lastTimeRequestedAReview: new Date() }),
      setContactSort: (contactSort: (typeof SortOptionValues)[number]) =>
        set({ contactSort }),
    })),
    {
      name: 'preferences',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
