import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { Publisher, PublisherHours } from '../types/publisher'
import i18n, { TranslatedLocale } from '../lib/locales'
import Constants from 'expo-constants'
import moment from 'moment'
import * as Device from 'expo-device'
import { ColorSchemeName, Platform } from 'react-native'
import { hasMigratedFromAsyncStorage, MmkvStorage } from './mmkv'
import { Address } from '../types/contact'
import { MinuteDisplayFormat } from '../types/serviceReport'

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

/**
 * These hints are enabled if true, and dismissed if false. See
 * `usePreferences.removeHint()` to set a hint to false.
 */
export const hints = {
  howToAddPlan: true,
}

type LegacyServiceReportTag = string

export function getTagName(tag: LegacyServiceReportTag | ServiceReportTag) {
  return typeof tag === 'string' ? tag : tag.value
}

export type ServiceReportTag = {
  /** Also acts as ID */
  value: string
  credit: boolean
}

export type PrefillAddress = {
  /** Whether or not prefill address is enabled. */
  enabled: boolean
  /** Most recently entered address from existing contact creation. */
  address?: Address
  /** When an address was last entered */
  lastUpdated?: Date
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
  defaultNavigationMapProvider:
    Platform.OS === 'ios'
      ? 'apple'
      : ('google' as DefaultNavigationMapProvider),
  lastAppVersion: Constants.expoConfig?.version || null,
  returnVisitTimeOffset: null as TimeOffset | null,
  returnVisitNotificationOffset: null as TimeOffset | null,
  returnVisitAlwaysNotify: false,
  /**
   * Tags were originally only strings, like "Bethel Service". Later, tags
   * needed more metadata - like whether or not a tag is a credit hour or not.
   * Example: {value: 'Bethel Service', credit: true}. This is why later the
   * data structure was changed to an object. The value also doubles as the id.
   */
  serviceReportTags: [] as (LegacyServiceReportTag | ServiceReportTag)[],
  displayDetailsOnProgressBarHomeScreen:
    Device.deviceType === Device.DeviceType.TABLET,
  monthlyRoutineHasShownInvalidMonthAlert: false,
  hideDonateHeart: false,
  ...hints,
  lastBackupDate: null as Date | null,
  remindMeAboutBackups: true,
  backupNotificationFrequencyAsDays: 60,
  userSpecifiedHasAnnualGoal: 'default' as boolean | 'default',
  fontSizeOffset: 0,
  customContactFields: [] as string[],
  hasAttemptedToMigrateToMmkv: false,
  /**
   * Hidden dev tools for diagnosing issues. To enable/disable, navigate to
   * drawer (settings) -> tap version number 5 times.
   */
  developerTools: false,
  prefillAddress: {
    address: undefined,
    enabled: true,
    lastUpdated: undefined,
  } as PrefillAddress,
  homeScreenElements: {
    approachingConversations: true,
    monthlyRoutine: true,
    tabletServiceYearSummary: true,
    serviceReport: true,
    timer: true,
    contacts: true,
  },
  colorScheme: undefined as ColorSchemeName,
  timeDisplayFormat: 'decimal' as MinuteDisplayFormat,
  locale: undefined as TranslatedLocale | undefined,
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
      removeHint: (hint: keyof typeof hints) =>
        set((preferences) => {
          const updatedPreferences = { ...preferences }
          updatedPreferences[hint] = false
          return updatedPreferences
        }),
      /**
       * Will not update lastUpdated property or address if address param is
       * undefined.
       */
      updatePrefillAddress: (address?: Address) => {
        if (!address || !Object.keys(address)) {
          return
        }

        set(({ prefillAddress }) => {
          return {
            prefillAddress: {
              ...prefillAddress,
              address,
              lastUpdated: new Date(),
            },
          }
        })
      },
    })),
    {
      name: 'preferences',
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : AsyncStorage
      ),
    }
  )
)
